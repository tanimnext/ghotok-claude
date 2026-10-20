import { Router } from 'express';
import { z } from 'zod';
import { TICKET_CATEGORIES, optionValues } from '@ghotok/shared';
import { conflict, notFound } from '../lib/errors.js';
import { assertObjectId, pageParams, paged, parse } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/security.js';
import { ContactMessage, SupportTicket, nextSequence } from '../models/index.js';

const router = Router();

export function toTicketJSON(t, { withMessages = false } = {}) {
  return {
    id: t._id.toString(),
    ticketNo: t.ticketNo,
    subject: t.subject,
    category: t.category,
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt,
    lastMessageAt: t.lastMessageAt,
    closedAt: t.closedAt ?? null,
    messageCount: t.messages?.length ?? 0,
    ...(withMessages ? {
      messages: (t.messages ?? []).map((m) => ({
        id: m._id.toString(),
        staff: m.staff,
        author: m.author?.name ? { name: m.staff ? 'Ghotok support' : m.author.name } : null,
        body: m.body,
        createdAt: m.createdAt,
      })),
    } : {}),
  };
}

router.get('/tickets', requireAuth, async (req, res) => {
  const p = pageParams(req.query, { defaultLimit: 20 });
  const filter = { user: req.user._id };
  const [items, total] = await Promise.all([
    SupportTicket.find(filter).sort({ lastMessageAt: -1 }).skip(p.skip).limit(p.limit),
    SupportTicket.countDocuments(filter),
  ]);
  res.json(paged(items.map((t) => toTicketJSON(t)), total, p));
});

router.post('/tickets', requireAuth, writeLimiter, async (req, res) => {
  const body = parse(z.object({
    subject: z.string().trim().min(4, 'Please add a short subject.').max(160),
    category: z.enum(optionValues(TICKET_CATEGORIES)).default('other'),
    message: z.string().trim().min(10, 'Please describe the problem.').max(5000),
  }), req.body);
  const open = await SupportTicket.countDocuments({ user: req.user._id, status: { $ne: 'closed' } });
  if (open >= 5) throw conflict('TOO_MANY_OPEN', 'You have 5 open tickets. Please wait for a reply or close one first.');
  const ticket = await SupportTicket.create({
    ticketNo: `T-${await nextSequence('ticket', 1000)}`,
    user: req.user._id,
    subject: body.subject,
    category: body.category,
    messages: [{ author: req.user._id, staff: false, body: body.message }],
  });
  res.status(201).json({ ticket: toTicketJSON(ticket) });
});

router.get('/tickets/:id', requireAuth, async (req, res) => {
  assertObjectId(req.params.id, 'Ticket');
  const t = await SupportTicket.findOne({ _id: req.params.id, user: req.user._id }).populate('messages.author', 'name');
  if (!t) throw notFound('Ticket');
  res.json({ ticket: toTicketJSON(t, { withMessages: true }) });
});

router.post('/tickets/:id/messages', requireAuth, writeLimiter, async (req, res) => {
  assertObjectId(req.params.id, 'Ticket');
  const { message } = parse(z.object({ message: z.string().trim().min(1).max(5000) }), req.body);
  const t = await SupportTicket.findOne({ _id: req.params.id, user: req.user._id });
  if (!t) throw notFound('Ticket');
  if (t.status === 'closed') throw conflict('TICKET_CLOSED', 'This ticket is closed. Please open a new one.');
  t.messages.push({ author: req.user._id, staff: false, body: message });
  t.status = 'waiting';
  t.lastMessageAt = new Date();
  await t.save();
  await t.populate('messages.author', 'name');
  res.json({ ticket: toTicketJSON(t, { withMessages: true }) });
});

router.post('/tickets/:id/close', requireAuth, async (req, res) => {
  assertObjectId(req.params.id, 'Ticket');
  const t = await SupportTicket.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { status: 'closed', closedAt: new Date() }, { new: true });
  if (!t) throw notFound('Ticket');
  res.json({ ticket: toTicketJSON(t) });
});

// Public contact form (no account needed).
router.post('/contact', writeLimiter, async (req, res) => {
  const body = parse(z.object({
    name: z.string().trim().min(2, 'Please enter your name.').max(80),
    email: z.string().trim().email('Enter a valid email.').max(120).optional().or(z.literal('')),
    phone: z.string().trim().max(20).optional(),
    subject: z.string().trim().max(160).optional(),
    message: z.string().trim().min(10, 'Please write a little more.').max(3000),
  }), req.body);
  await ContactMessage.create({ ...body, email: body.email || undefined, user: req.user?._id, ip: req.ip });
  res.status(201).json({ ok: true });
});

export default router;
