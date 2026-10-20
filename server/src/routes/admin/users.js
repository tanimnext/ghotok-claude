import { Router } from 'express';
import { z } from 'zod';
import { ROLE_OPTIONS, USER_STATUS_OPTIONS, can, isValidEmail, isValidPhone, normalizePhone, optionValues } from '@ghotok/shared';
import { audit, notify } from '../../lib/audit.js';
import { hashPassword, revokeAllSessions } from '../../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { assertObjectId, escapeRegex, pageParams, paged, parse } from '../../lib/http.js';
import { requirePermission } from '../../middleware/auth.js';
import { Biodata, ConnectionTransaction, ContactUnlock, Payment, Report, SupportTicket, User } from '../../models/index.js';
import { biodataRow } from './helpers.js';

const router = Router();

router.get('/users', requirePermission('users.view'), async (req, res) => {
  const q = req.query;
  const filter = {};
  if (optionValues(ROLE_OPTIONS).includes(q.role)) filter.role = q.role;
  if (q.role === 'staff') filter.role = { $in: ['support', 'super_admin'] };
  if (optionValues(USER_STATUS_OPTIONS).includes(q.status)) filter.status = q.status;
  if (q.verified === 'false') { filter.emailVerified = { $ne: true }; filter.phoneVerified = { $ne: true }; }
  if (q.q) {
    const s = String(q.q).trim();
    const re = new RegExp(escapeRegex(s), 'i');
    filter.$or = [{ name: re }, { email: re }, { phone: re }];
    const b = await Biodata.findOne({ biodataNo: s.toUpperCase() }).select('user');
    if (b) filter.$or.push({ _id: b.user });
  }
  const p = pageParams(q, { defaultLimit: 20 });
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit),
    User.countDocuments(filter),
  ]);
  const biodatas = await Biodata.find({ user: { $in: users.map((u) => u._id) } }).select('user biodataNo status').lean();
  const byUser = new Map(biodatas.map((b) => [b.user.toString(), b]));
  res.json(paged(users.map((u) => ({
    ...u.toSafeJSON(),
    biodata: byUser.has(u._id.toString()) ? { biodataNo: byUser.get(u._id.toString()).biodataNo, status: byUser.get(u._id.toString()).status } : null,
  })), total, p));
});

router.get('/users/:id', requirePermission('users.view'), async (req, res) => {
  assertObjectId(req.params.id, 'User');
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('User');
  const [biodata, payments, ledger, unlocks, tickets, reports] = await Promise.all([
    Biodata.findOne({ user: user._id }),
    Payment.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
    ConnectionTransaction.find({ user: user._id }).sort({ createdAt: -1 }).limit(20).populate('biodata', 'biodataNo').populate('actor', 'name').lean(),
    ContactUnlock.countDocuments({ user: user._id }),
    SupportTicket.countDocuments({ user: user._id }),
    Report.countDocuments({ targetUser: user._id }),
  ]);
  res.json({
    user: { ...user.toSafeJSON(), statusReason: user.statusReason ?? null },
    biodata: biodata ? biodataRow(biodata) : null,
    payments: payments.map((p) => ({ id: p._id, invoiceNo: p.invoiceNo, amount: p.amount, connections: p.connections, method: p.method, status: p.status, trxId: p.trxId ?? null, createdAt: p.createdAt })),
    ledger: ledger.map((t) => ({ id: t._id, type: t.type, delta: t.delta, balanceAfter: t.balanceAfter, reason: t.reason ?? null, biodataNo: t.biodata?.biodataNo ?? null, actor: t.actor?.name ?? null, createdAt: t.createdAt })),
    counts: { unlocks, tickets, reportsAgainst: reports },
  });
});

router.patch('/users/:id', requirePermission('users.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'User');
  const body = parse(z.object({
    name: z.string().trim().min(2).max(80).optional(),
    email: z.string().trim().max(120).nullable().optional(),
    phone: z.string().trim().max(20).nullable().optional(),
    role: z.enum(optionValues(ROLE_OPTIONS)).optional(),
    status: z.enum(optionValues(USER_STATUS_OPTIONS)).optional(),
    statusReason: z.string().trim().max(500).optional(),
    emailVerified: z.boolean().optional(),
    phoneVerified: z.boolean().optional(),
  }), req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('User');
  const self = user._id.equals(req.user._id);
  if (self && (body.role && body.role !== user.role)) throw forbidden('SELF_ROLE', 'You cannot change your own role.');
  if (self && body.status && body.status !== 'active') throw forbidden('SELF_STATUS', 'You cannot suspend your own account.');
  if (body.role && body.role !== user.role && !can(req.user.role, 'roles.assign')) throw forbidden();

  if (body.email !== undefined) {
    const email = body.email ? body.email.toLowerCase() : undefined;
    if (email && !isValidEmail(email)) throw badRequest('VALIDATION_ERROR', 'Invalid email.', { fields: { email: 'invalid' } });
    if (email && (await User.exists({ email, _id: { $ne: user._id } }))) throw conflict('DUPLICATE', 'Another account uses this email.');
    user.email = email;
  }
  if (body.phone !== undefined) {
    const phone = body.phone ? normalizePhone(body.phone) : undefined;
    if (phone && !isValidPhone(phone)) throw badRequest('VALIDATION_ERROR', 'Invalid mobile number.', { fields: { phone: 'invalid' } });
    if (phone && (await User.exists({ phone, _id: { $ne: user._id } }))) throw conflict('DUPLICATE', 'Another account uses this number.');
    user.phone = phone;
  }
  const before = { role: user.role, status: user.status };
  for (const k of ['name', 'role', 'status', 'statusReason', 'emailVerified', 'phoneVerified']) if (body[k] !== undefined) user[k] = body[k];
  await user.save();

  if (body.status && body.status !== before.status) {
    const inactive = ['suspended', 'banned'].includes(body.status);
    await Biodata.updateOne({ user: user._id }, { blocked: inactive });
    if (inactive) await revokeAllSessions(user._id);
    await audit(req, 'user.status', { targetType: 'user', targetId: user._id, summary: `${user.name}: ${before.status} → ${body.status}`, meta: { reason: body.statusReason } });
  }
  if (body.role && body.role !== before.role) {
    await revokeAllSessions(user._id);
    await audit(req, 'user.role', { targetType: 'user', targetId: user._id, summary: `${user.name}: ${before.role} → ${body.role}` });
  }
  await audit(req, 'user.update', { targetType: 'user', targetId: user._id, summary: `Updated ${user.name}`, meta: Object.keys(body) });
  res.json({ user: user.toSafeJSON() });
});

router.post('/users', requirePermission('users.manage'), async (req, res) => {
  const body = parse(z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().max(120).optional().or(z.literal('')),
    phone: z.string().trim().max(20).optional().or(z.literal('')),
    password: z.string().min(8).max(128),
    role: z.enum(optionValues(ROLE_OPTIONS)).default('support'),
  }), req.body);
  if (body.role !== 'user' && !can(req.user.role, 'roles.assign')) throw forbidden();
  const email = body.email ? body.email.toLowerCase() : undefined;
  const phone = body.phone ? normalizePhone(body.phone) : undefined;
  if (!email && !phone) throw badRequest('VALIDATION_ERROR', 'Enter an email or a mobile number.', { fields: { email: 'required' } });
  if (email && !isValidEmail(email)) throw badRequest('VALIDATION_ERROR', 'Invalid email.', { fields: { email: 'invalid' } });
  if (phone && !isValidPhone(phone)) throw badRequest('VALIDATION_ERROR', 'Invalid mobile number.', { fields: { phone: 'invalid' } });
  if (await User.exists({ $or: [email && { email }, phone && { phone }].filter(Boolean) })) throw conflict('ACCOUNT_EXISTS', 'An account with this email or mobile number already exists.');
  const user = await User.create({
    name: body.name, email, phone, role: body.role, passwordHash: await hashPassword(body.password),
    emailVerified: !!email, phoneVerified: !!phone,
  });
  await audit(req, 'user.create', { targetType: 'user', targetId: user._id, summary: `Created ${body.role} ${user.name}` });
  res.status(201).json({ user: user.toSafeJSON() });
});

router.post('/users/:id/reset-password', requirePermission('users.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'User');
  const { password } = parse(z.object({ password: z.string().min(8).max(128) }), req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('User');
  user.passwordHash = await hashPassword(password);
  await user.save();
  await revokeAllSessions(user._id);
  await notify(user._id, 'password_reset_by_staff', {});
  await audit(req, 'user.reset_password', { targetType: 'user', targetId: user._id, summary: `Reset password of ${user.name}` });
  res.json({ ok: true });
});

export default router;
