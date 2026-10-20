import { Router } from 'express';
import { z } from 'zod';
import { ADJUSTMENT_ACTIONS, LEDGER_TYPES, PAYMENT_METHODS, REFUND_RESOLUTIONS, optionValues } from '@ghotok/shared';
import { audit, notify } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { assertObjectId, escapeRegex, pageParams, paged, parse } from '../../lib/http.js';
import { requirePermission } from '../../middleware/auth.js';
import { ConnectionTransaction, Package, Payment, RefundRequest, User } from '../../models/index.js';
import { changeBalance, creditPayment } from '../../services/connections.js';
import { toPackageJSON, toPaymentJSON } from '../billing.js';
import { findUserByAny, userSummary } from './helpers.js';

const router = Router();

// ----- Payments -------------------------------------------------------------

router.get('/payments', requirePermission('payments.manage'), async (req, res) => {
  const q = req.query;
  const filter = {};
  if (['initiated', 'pending', 'verified', 'rejected', 'failed', 'cancelled', 'refunded'].includes(q.status)) filter.status = q.status;
  else filter.status = { $ne: 'initiated' };
  if (optionValues(PAYMENT_METHODS).includes(q.method)) filter.method = q.method;
  if (q.mode === 'manual' || q.mode === 'gateway') filter.mode = q.mode;
  if (q.q) {
    const s = String(q.q).trim();
    const re = new RegExp(escapeRegex(s), 'i');
    filter.$or = [{ invoiceNo: re }, { trxId: re }, { senderNumber: re }];
  }
  const p = pageParams(q, { defaultLimit: 20 });
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: filter.status === 'pending' ? 1 : -1 }).skip(p.skip).limit(p.limit).populate('user', 'name email phone role status').populate('reviewedBy', 'name'),
    Payment.countDocuments(filter),
  ]);
  res.json(paged(items.map((x) => ({ ...toPaymentJSON(x), user: userSummary(x.user), reviewedBy: x.reviewedBy?.name ?? null, reviewedAt: x.reviewedAt ?? null })), total, p));
});

router.post('/payments/:id/verify', requirePermission('payments.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'Payment');
  const payment = await creditPayment(req.params.id, { actor: req.user._id });
  if (!payment) throw conflict('NOT_PENDING', 'This payment has already been processed.');
  await audit(req, 'payment.verify', { targetType: 'payment', targetId: payment._id, summary: `Verified ${payment.invoiceNo} (${payment.method} ${payment.trxId ?? ''}) +${payment.connections}` });
  res.json({ payment: toPaymentJSON(payment) });
});

router.post('/payments/:id/reject', requirePermission('payments.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'Payment');
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Add a reason for the user.').max(500) }), req.body);
  const payment = await Payment.findOneAndUpdate(
    { _id: req.params.id, status: 'pending' },
    { status: 'rejected', rejectReason: reason, reviewedBy: req.user._id, reviewedAt: new Date() },
    { new: true },
  );
  if (!payment) throw conflict('NOT_PENDING', 'This payment has already been processed.');
  await notify(payment.user, 'payment_rejected', { invoiceNo: payment.invoiceNo, reason }, '/dashboard/connections');
  await audit(req, 'payment.reject', { targetType: 'payment', targetId: payment._id, summary: `Rejected ${payment.invoiceNo}`, meta: { reason } });
  res.json({ payment: toPaymentJSON(payment) });
});

// ----- Refunds --------------------------------------------------------------

router.get('/refunds', requirePermission('refunds.manage'), async (req, res) => {
  const filter = {};
  if (['pending', 'approved', 'rejected'].includes(req.query.status)) filter.status = req.query.status;
  const p = pageParams(req.query, { defaultLimit: 20 });
  const [items, total] = await Promise.all([
    RefundRequest.find(filter).sort({ createdAt: filter.status === 'pending' ? 1 : -1 }).skip(p.skip).limit(p.limit)
      .populate('user', 'name email phone role status connectionBalance').populate('payment').populate('decidedBy', 'name'),
    RefundRequest.countDocuments(filter),
  ]);
  res.json(paged(items.map((r) => ({
    id: r._id, status: r.status, reason: r.reason, resolution: r.resolution ?? null, connections: r.connections ?? null, amount: r.amount ?? null,
    refundTrxId: r.refundTrxId ?? null, note: r.note ?? null, createdAt: r.createdAt, decidedAt: r.decidedAt ?? null, decidedBy: r.decidedBy?.name ?? null,
    user: r.user ? { ...userSummary(r.user), connectionBalance: r.user.connectionBalance } : null,
    payment: r.payment ? toPaymentJSON(r.payment) : null,
  })), total, p));
});

router.post('/refunds/:id/approve', requirePermission('refunds.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'Refund');
  const body = parse(z.object({
    resolution: z.enum(optionValues(REFUND_RESOLUTIONS)),
    connections: z.number().int().min(0).max(1000).optional(),
    amount: z.number().min(0).max(1_000_000).optional(),
    refundTrxId: z.string().trim().max(40).optional(),
    note: z.string().trim().max(1000).optional(),
  }), req.body);
  const refund = await RefundRequest.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { status: 'approved', decidedBy: req.user._id, decidedAt: new Date() }, { new: true });
  if (!refund) throw conflict('NOT_PENDING', 'This refund request has already been decided.');
  const payment = await Payment.findById(refund.payment);
  try {
    if (body.resolution === 'connection_credit') {
      const qty = body.connections ?? payment.connections;
      if (qty > 0) await changeBalance(refund.user, qty, { type: 'refund_credit', payment: payment._id, refund: refund._id, actor: req.user._id, reason: body.note ?? `Refund credit for ${payment.invoiceNo}` });
      Object.assign(refund, { resolution: body.resolution, connections: qty, note: body.note });
    } else {
      // Money returned: take back the purchased connections that are still unused.
      const qty = body.connections ?? (payment.status === 'verified' ? payment.connections : 0);
      let revoked = 0;
      if (qty > 0) {
        const r = await changeBalance(refund.user, -qty, { type: 'refund_revoke', payment: payment._id, refund: refund._id, actor: req.user._id, reason: body.note ?? `Refund of ${payment.invoiceNo}`, clamp: true });
        revoked = -r.applied;
      }
      payment.status = 'refunded';
      payment.refundedAt = new Date();
      await payment.save();
      Object.assign(refund, { resolution: body.resolution, connections: revoked, amount: body.amount ?? payment.amount, refundTrxId: body.refundTrxId, note: body.note });
    }
    await refund.save();
  } catch (err) {
    await RefundRequest.updateOne({ _id: refund._id }, { status: 'pending', $unset: { decidedBy: 1, decidedAt: 1 } });
    throw err;
  }
  await notify(refund.user, 'refund_approved', { invoiceNo: payment.invoiceNo, resolution: refund.resolution, connections: refund.connections, amount: refund.amount }, '/dashboard/connections');
  await audit(req, 'refund.approve', { targetType: 'refund', targetId: refund._id, summary: `Refund for ${payment.invoiceNo}: ${refund.resolution}`, meta: body });
  res.json({ ok: true });
});

router.post('/refunds/:id/reject', requirePermission('refunds.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'Refund');
  const { note } = parse(z.object({ note: z.string().trim().min(3, 'Add a note for the user.').max(1000) }), req.body);
  const refund = await RefundRequest.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { status: 'rejected', note, decidedBy: req.user._id, decidedAt: new Date() }, { new: true }).populate('payment', 'invoiceNo');
  if (!refund) throw conflict('NOT_PENDING', 'This refund request has already been decided.');
  await notify(refund.user, 'refund_rejected', { invoiceNo: refund.payment?.invoiceNo, note }, '/dashboard/connections');
  await audit(req, 'refund.reject', { targetType: 'refund', targetId: refund._id, summary: `Rejected refund for ${refund.payment?.invoiceNo}` });
  res.json({ ok: true });
});

// ----- Manual connection adjustments ------------------------------------------

router.post('/connections/adjust', requirePermission('connections.adjust'), async (req, res) => {
  const body = parse(z.object({
    user: z.string().trim().min(3, 'Enter a user id, email or mobile number.'),
    action: z.enum(optionValues(ADJUSTMENT_ACTIONS)),
    quantity: z.number().int().min(1).max(1000),
    reason: z.string().trim().min(3, 'The reason is saved in the audit log.').max(500),
  }), req.body);
  const user = await findUserByAny(body.user);
  const type = { grant: 'admin_grant', revoke: 'admin_revoke', refund_credit: 'refund_credit' }[body.action];
  const delta = body.action === 'revoke' ? -body.quantity : body.quantity;
  const { user: updated, transaction } = await changeBalance(user._id, delta, { type, actor: req.user._id, reason: body.reason });
  await notify(user._id, 'connections_adjusted', { delta, balance: updated.connectionBalance, reason: body.reason }, '/dashboard/connections');
  await audit(req, `connections.${body.action}`, { targetType: 'user', targetId: user._id, summary: `${delta > 0 ? '+' : ''}${delta} connections for ${user.name}`, meta: { reason: body.reason } });
  res.json({ user: userSummary(updated), balance: updated.connectionBalance, transactionId: transaction._id });
});

router.get('/connections/ledger', requirePermission('connections.adjust'), async (req, res) => {
  const filter = {};
  if (req.query.user) filter.user = (await findUserByAny(req.query.user))._id;
  if (optionValues(LEDGER_TYPES).includes(req.query.type)) filter.type = req.query.type;
  const p = pageParams(req.query, { defaultLimit: 25 });
  const [items, total] = await Promise.all([
    ConnectionTransaction.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit)
      .populate('user', 'name email phone role status').populate('actor', 'name').populate('biodata', 'biodataNo').populate('payment', 'invoiceNo').lean(),
    ConnectionTransaction.countDocuments(filter),
  ]);
  res.json(paged(items.map((t) => ({
    id: t._id, type: t.type, delta: t.delta, balanceAfter: t.balanceAfter, reason: t.reason ?? null, createdAt: t.createdAt,
    user: userSummary(t.user), actor: t.actor?.name ?? null, biodataNo: t.biodata?.biodataNo ?? null, invoiceNo: t.payment?.invoiceNo ?? null,
  })), total, p));
});

// ----- Packages -------------------------------------------------------------

const packageBody = z.object({
  name: z.object({ en: z.string().trim().min(1).max(60), bn: z.string().trim().max(60).optional() }),
  description: z.object({ en: z.string().trim().max(200).optional(), bn: z.string().trim().max(200).optional() }).optional(),
  connections: z.number().int().min(1).max(1000),
  price: z.number().int().min(1).max(1_000_000),
  isActive: z.boolean().optional(),
  highlight: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.get('/packages', requirePermission('packages.manage'), async (_req, res) => {
  const items = await Package.find().sort({ sortOrder: 1, price: 1 });
  const sold = await Payment.aggregate([{ $match: { status: 'verified' } }, { $group: { _id: '$package', n: { $sum: 1 }, revenue: { $sum: '$amount' } } }]);
  const byId = new Map(sold.map((s) => [String(s._id), s]));
  res.json({ items: items.map((p) => ({ ...toPackageJSON(p), sold: byId.get(p._id.toString())?.n ?? 0, revenue: byId.get(p._id.toString())?.revenue ?? 0 })) });
});

router.post('/packages', requirePermission('packages.manage'), async (req, res) => {
  const body = parse(packageBody, req.body);
  const pkg = await Package.create(body);
  await audit(req, 'package.create', { targetType: 'package', targetId: pkg._id, summary: `Created package ${pkg.name.en}` });
  res.status(201).json({ package: toPackageJSON(pkg) });
});

router.patch('/packages/:id', requirePermission('packages.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'Package');
  const body = parse(packageBody.partial(), req.body);
  const pkg = await Package.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!pkg) throw notFound('Package');
  await audit(req, 'package.update', { targetType: 'package', targetId: pkg._id, summary: `Updated package ${pkg.name.en}`, meta: body });
  res.json({ package: toPackageJSON(pkg) });
});

router.delete('/packages/:id', requirePermission('packages.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'Package');
  const pkg = await Package.findById(req.params.id);
  if (!pkg) throw notFound('Package');
  // Keep packages that have payments so history stays readable; just retire them.
  if (await Payment.exists({ package: pkg._id })) {
    pkg.isActive = false;
    await pkg.save();
  } else {
    await pkg.deleteOne();
  }
  await audit(req, 'package.delete', { targetType: 'package', targetId: pkg._id, summary: `Removed package ${pkg.name.en}` });
  res.json({ ok: true });
});

export default router;
