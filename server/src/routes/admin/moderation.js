import { Router } from 'express';
import { z } from 'zod';
import { REPORT_STATUS, TICKET_PRIORITY, TICKET_STATUS, optionValues } from '@ghotok/shared';
import { audit, notify } from '../../lib/audit.js';
import { conflict, notFound } from '../../lib/errors.js';
import { assertObjectId, escapeRegex, pageParams, paged, parse } from '../../lib/http.js';
import { requirePermission } from '../../middleware/auth.js';
import { ContactMessage, Report, SupportTicket, User } from '../../models/index.js';
import { toTicketJSON } from '../support.js';
import { biodataRow, userSummary } from './helpers.js';

const router = Router();

// ----- Reports and flagged accounts ---------------------------------------------

router.get('/reports', requirePermission('reports.manage'), async (req, res) => {
  const filter = {};
  if (optionValues(REPORT_STATUS).includes(req.query.status)) filter.status = req.query.status;
  else if (req.query.status === 'active') filter.status = { $in: ['open', 'in_review'] };
  const p = pageParams(req.query, { defaultLimit: 20 });
  const [items, total] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit)
      .populate('reporter', 'name email phone role status').populate('targetUser', 'name email phone role status')
      .populate('biodata').populate('handledBy', 'name'),
    Report.countDocuments(filter),
  ]);
  // How many times each target has been reported, to surface repeat offenders.
  const counts = await Report.aggregate([
    { $match: { targetUser: { $in: items.map((r) => r.targetUser?._id).filter(Boolean) } } },
    { $group: { _id: '$targetUser', n: { $sum: 1 } } },
  ]);
  const countOf = new Map(counts.map((c) => [c._id.toString(), c.n]));
  res.json(paged(items.map((r) => ({
    id: r._id, reason: r.reason, details: r.details ?? null, status: r.status, actionTaken: r.actionTaken ?? null,
    createdAt: r.createdAt, handledAt: r.handledAt ?? null, handledBy: r.handledBy?.name ?? null,
    reporter: userSummary(r.reporter), targetUser: userSummary(r.targetUser),
    timesReported: r.targetUser ? countOf.get(r.targetUser._id.toString()) ?? 1 : 1,
    biodata: r.biodata ? biodataRow(r.biodata) : null,
  })), total, p));
});

router.patch('/reports/:id', requirePermission('reports.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'Report');
  const body = parse(z.object({ status: z.enum(optionValues(REPORT_STATUS)), actionTaken: z.string().trim().max(500).optional() }), req.body);
  const update = { ...body };
  if (body.status === 'resolved' || body.status === 'dismissed') Object.assign(update, { handledBy: req.user._id, handledAt: new Date() });
  const r = await Report.findByIdAndUpdate(req.params.id, update, { new: true }).populate('biodata', 'biodataNo');
  if (!r) throw notFound('Report');
  if (body.status === 'resolved' || body.status === 'dismissed') {
    await notify(r.reporter, 'report_closed', { biodataNo: r.biodata?.biodataNo, status: body.status });
  }
  await audit(req, 'report.update', { targetType: 'report', targetId: r._id, summary: `Report on ${r.biodata?.biodataNo ?? 'user'} → ${body.status}`, meta: body });
  res.json({ ok: true });
});

// ----- Support tickets ----------------------------------------------------------

router.get('/tickets', requirePermission('tickets.manage'), async (req, res) => {
  const q = req.query;
  const filter = {};
  if (optionValues(TICKET_STATUS).includes(q.status)) filter.status = q.status;
  else if (q.status === 'active') filter.status = { $ne: 'closed' };
  if (q.category) filter.category = String(q.category);
  if (q.q) {
    const re = new RegExp(escapeRegex(String(q.q).trim()), 'i');
    const users = await User.find({ $or: [{ name: re }, { email: re }, { phone: re }] }).select('_id').limit(50);
    filter.$or = [{ ticketNo: re }, { subject: re }, { user: { $in: users.map((u) => u._id) } }];
  }
  const p = pageParams(q, { defaultLimit: 20 });
  const [items, total] = await Promise.all([
    SupportTicket.find(filter).sort({ lastMessageAt: -1 }).skip(p.skip).limit(p.limit).populate('user', 'name email phone role status').populate('assignedTo', 'name'),
    SupportTicket.countDocuments(filter),
  ]);
  res.json(paged(items.map((t) => ({ ...toTicketJSON(t), user: userSummary(t.user), assignedTo: t.assignedTo?.name ?? null })), total, p));
});

async function loadTicket(id) {
  assertObjectId(id, 'Ticket');
  const t = await SupportTicket.findById(id).populate('user', 'name email phone role status').populate('messages.author', 'name');
  if (!t) throw notFound('Ticket');
  return t;
}

function staffTicketJSON(t) {
  const json = toTicketJSON(t, { withMessages: true });
  // Staff see who on the team replied.
  json.messages = t.messages.map((m) => ({ id: m._id.toString(), staff: m.staff, author: { name: m.author?.name ?? 'Unknown' }, body: m.body, createdAt: m.createdAt }));
  return { ...json, user: userSummary(t.user), assignedTo: t.assignedTo ?? null };
}

router.get('/tickets/:id', requirePermission('tickets.manage'), async (req, res) => {
  res.json({ ticket: staffTicketJSON(await loadTicket(req.params.id)) });
});

router.post('/tickets/:id/messages', requirePermission('tickets.manage'), async (req, res) => {
  const { message, close } = parse(z.object({ message: z.string().trim().min(1).max(5000), close: z.boolean().optional() }), req.body);
  const t = await loadTicket(req.params.id);
  if (t.status === 'closed') throw conflict('TICKET_CLOSED', 'This ticket is closed.');
  t.messages.push({ author: req.user._id, staff: true, body: message });
  t.status = close ? 'closed' : 'answered';
  if (close) t.closedAt = new Date();
  t.lastMessageAt = new Date();
  t.assignedTo ??= req.user._id;
  await t.save();
  await t.populate('messages.author', 'name');
  await notify(t.user._id, 'ticket_replied', { ticketNo: t.ticketNo }, `/dashboard/support/${t._id}`);
  res.json({ ticket: staffTicketJSON(t) });
});

router.patch('/tickets/:id', requirePermission('tickets.manage'), async (req, res) => {
  const body = parse(z.object({
    status: z.enum(optionValues(TICKET_STATUS)).optional(),
    priority: z.enum(optionValues(TICKET_PRIORITY)).optional(),
    assignToMe: z.boolean().optional(),
  }), req.body);
  const t = await loadTicket(req.params.id);
  if (body.status) {
    t.status = body.status;
    t.closedAt = body.status === 'closed' ? new Date() : undefined;
  }
  if (body.priority) t.priority = body.priority;
  if (body.assignToMe) t.assignedTo = req.user._id;
  await t.save();
  res.json({ ticket: staffTicketJSON(t) });
});

// ----- Contact form messages -----------------------------------------------------

router.get('/contact-messages', requirePermission('tickets.manage'), async (req, res) => {
  const filter = {};
  if (['new', 'read', 'replied', 'archived'].includes(req.query.status)) filter.status = req.query.status;
  const p = pageParams(req.query, { defaultLimit: 20 });
  const [items, total] = await Promise.all([
    ContactMessage.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    ContactMessage.countDocuments(filter),
  ]);
  res.json(paged(items.map(({ ip, ...m }) => ({ ...m, id: m._id })), total, p));
});

router.patch('/contact-messages/:id', requirePermission('tickets.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'Message');
  const { status } = parse(z.object({ status: z.enum(['new', 'read', 'replied', 'archived']) }), req.body);
  const m = await ContactMessage.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!m) throw notFound('Message');
  res.json({ ok: true });
});

export default router;
