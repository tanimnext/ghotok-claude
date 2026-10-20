import { Router } from 'express';
import { z } from 'zod';
import { PAYMENT_METHODS, isValidPhone, normalizePhone, optionValues } from '@ghotok/shared';
import { env } from '../config/env.js';
import { ApiError, badRequest, conflict, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { objectId, pageParams, paged, parse } from '../lib/http.js';
import { gatewayFor, gateways } from '../lib/payments/index.js';
import { getSetting } from '../lib/settings.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/security.js';
import { Package, Payment, RefundRequest, nextSequence } from '../models/index.js';
import { creditPayment } from '../services/connections.js';

const router = Router();

export function toPackageJSON(p) {
  return {
    id: p._id.toString(), name: p.name, description: p.description ?? null, connections: p.connections, price: p.price,
    perConnection: Math.round(p.price / p.connections), highlight: !!p.highlight, isActive: p.isActive, sortOrder: p.sortOrder,
  };
}

export function toPaymentJSON(p) {
  return {
    id: p._id.toString(), invoiceNo: p.invoiceNo, packageName: p.packageName, connections: p.connections, amount: p.amount,
    method: p.method, mode: p.mode, senderNumber: p.senderNumber ?? null, trxId: p.trxId ?? null, status: p.status,
    rejectReason: p.rejectReason ?? null, createdAt: p.createdAt, creditedAt: p.creditedAt ?? null, refundedAt: p.refundedAt ?? null,
  };
}

async function paymentMethods() {
  const settings = await getSetting('payments');
  return {
    verificationHours: settings.verificationHours,
    methods: PAYMENT_METHODS.map((m) => ({
      value: m.value,
      en: m.en,
      bn: m.bn,
      enabled: settings[m.value]?.enabled !== false,
      manualNumber: settings[m.value]?.manualNumber || null,
      accountType: settings[m.value]?.accountType ?? 'personal',
      gateway: !!gateways[m.value]?.enabled,
    })),
  };
}

router.get('/packages', async (_req, res) => {
  const packages = await Package.find({ isActive: true }).sort({ sortOrder: 1, price: 1 });
  res.json({ packages: packages.map(toPackageJSON), ...(await paymentMethods()) });
});

const invoiceNo = async () => {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `INV-${ymd}-${await nextSequence('invoice', 10000)}`;
};

router.post('/payments', requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const body = parse(z.object({
    packageId: objectId,
    method: z.enum(optionValues(PAYMENT_METHODS)),
    mode: z.enum(['manual', 'gateway']).default('manual'),
    senderNumber: z.string().trim().max(20).optional(),
    trxId: z.string().trim().max(40).optional(),
  }), req.body);

  const pkg = await Package.findOne({ _id: body.packageId, isActive: true });
  if (!pkg) throw notFound('Package');
  const { methods } = await paymentMethods();
  const method = methods.find((m) => m.value === body.method);
  if (!method?.enabled) throw badRequest('METHOD_DISABLED', 'This payment method is not available right now.');

  const base = {
    user: req.user._id, package: pkg._id, packageName: pkg.name, connections: pkg.connections, amount: pkg.price, method: body.method,
  };

  if (body.mode === 'gateway') {
    const gateway = gatewayFor(body.method);
    if (!gateway) throw badRequest('GATEWAY_UNAVAILABLE', 'Online checkout is not available for this method. Please use Send Money.');
    const payment = await Payment.create({ ...base, invoiceNo: await invoiceNo(), mode: 'gateway', status: 'initiated' });
    try {
      const started = await gateway.startCheckout(payment, { callbackURL: `${env.API_PUBLIC_URL}/api/payments/${body.method}/callback`, ip: req.ip });
      payment.gateway = { paymentId: started.paymentId, response: started.raw };
      await payment.save();
      return res.status(201).json({ payment: toPaymentJSON(payment), redirectURL: started.redirectURL });
    } catch (err) {
      logger.error({ err, invoice: payment.invoiceNo }, 'Gateway checkout failed to start');
      payment.status = 'failed';
      await payment.save();
      throw new ApiError(502, 'GATEWAY_ERROR', 'The payment gateway is not responding. Please try again or use Send Money.');
    }
  }

  const senderNumber = normalizePhone(body.senderNumber);
  if (!isValidPhone(senderNumber)) throw badRequest('VALIDATION_ERROR', 'Enter the mobile number you paid from.', { fields: { senderNumber: 'phone' } });
  const trxId = String(body.trxId ?? '').toUpperCase();
  if (!/^[A-Z0-9]{6,20}$/.test(trxId)) throw badRequest('VALIDATION_ERROR', 'Enter the transaction ID from the confirmation SMS.', { fields: { trxId: 'invalid' } });
  if (await Payment.exists({ method: body.method, trxId, status: { $in: ['pending', 'verified', 'refunded'] } })) {
    throw conflict('DUPLICATE_TRX', 'This transaction ID has already been submitted.');
  }
  const pending = await Payment.countDocuments({ user: req.user._id, mode: 'manual', status: 'pending' });
  if (pending >= 3) throw new ApiError(429, 'TOO_MANY_PENDING', 'You already have 3 payments waiting for verification. Please wait for them to be reviewed.');

  const payment = await Payment.create({ ...base, invoiceNo: await invoiceNo(), mode: 'manual', status: 'pending', senderNumber, trxId });
  res.status(201).json({ payment: toPaymentJSON(payment) });
});

// Redirect target for bKash / Nagad after the customer pays (or cancels).
router.get('/payments/:method/callback', async (req, res) => {
  const gateway = gatewayFor(req.params.method);
  const back = (status, invoice) => res.redirect(`${env.WEB_URL}/dashboard/connections?payment=${status}${invoice ? `&invoice=${encodeURIComponent(invoice)}` : ''}`);
  if (!gateway) return back('failed');
  let result;
  try {
    result = await gateway.completeCheckout(req.query);
  } catch (err) {
    logger.error({ err, method: req.params.method }, 'Gateway callback failed');
    return back('failed');
  }
  const payment = result.paymentId ? await Payment.findOne({ 'gateway.paymentId': result.paymentId, method: req.params.method }) : null;
  if (!payment) return back('failed');
  if (payment.status === 'verified') return back('success', payment.invoiceNo);
  if (result.success && (result.amount === undefined || Math.abs(result.amount - payment.amount) < 0.01)) {
    await creditPayment(payment._id, { trxId: result.trxId, gatewayResponse: result.raw });
    return back('success', payment.invoiceNo);
  }
  await Payment.updateOne(
    { _id: payment._id, status: 'initiated' },
    { status: result.cancelled ? 'cancelled' : 'failed', 'gateway.response': result.raw },
  );
  back(result.cancelled ? 'cancelled' : 'failed', payment.invoiceNo);
});

router.get('/payments/mine', requireAuth, async (req, res) => {
  const p = pageParams(req.query, { defaultLimit: 20 });
  const filter = { user: req.user._id, status: { $ne: 'initiated' } };
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit),
    Payment.countDocuments(filter),
  ]);
  const refunds = await RefundRequest.find({ payment: { $in: items.map((i) => i._id) } }).sort({ createdAt: -1 }).lean();
  const refundOf = new Map();
  for (const r of refunds) if (!refundOf.has(r.payment.toString())) refundOf.set(r.payment.toString(), { id: r._id, status: r.status, resolution: r.resolution ?? null });
  res.json(paged(items.map((i) => ({ ...toPaymentJSON(i), refund: refundOf.get(i._id.toString()) ?? null })), total, p));
});

router.post('/refunds', requireAuth, writeLimiter, async (req, res) => {
  const body = parse(z.object({ paymentId: objectId, reason: z.string().trim().min(10, 'Please explain the reason.').max(1000) }), req.body);
  const payment = await Payment.findOne({ _id: body.paymentId, user: req.user._id });
  if (!payment) throw notFound('Payment');
  if (!['verified', 'rejected', 'pending'].includes(payment.status)) throw conflict('NOT_REFUNDABLE', 'This payment cannot be refunded.');
  if (await RefundRequest.exists({ payment: payment._id, status: 'pending' })) throw conflict('ALREADY_REQUESTED', 'A refund request for this payment is already pending.');
  const refund = await RefundRequest.create({ user: req.user._id, payment: payment._id, reason: body.reason });
  res.status(201).json({ refund: { id: refund._id, status: refund.status } });
});

router.get('/refunds/mine', requireAuth, async (req, res) => {
  const items = await RefundRequest.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).populate('payment', 'invoiceNo amount method').lean();
  res.json({ items });
});

export default router;
