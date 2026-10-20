import { Router } from 'express';
import { z } from 'zod';
import { clearAuthCookies, hashPassword, revokeAllSessions, signIn, verifyPassword } from '../lib/auth.js';
import { ApiError, conflict, notFound } from '../lib/errors.js';
import { assertObjectId, pageParams, paged, parse } from '../lib/http.js';
import { notify } from '../lib/audit.js';
import { requireAuth } from '../middleware/auth.js';
import {
  Biodata, ConnectionTransaction, ContactUnlock, Dislike, Favorite, Notification, Payment, Proposal, SupportTicket, User,
} from '../models/index.js';
import { toCard, visitStats } from '../services/biodata.js';

const router = Router();
router.use(requireAuth);

const isPublic = (b) => b && b.status === 'approved' && !b.isHidden && !b.blocked && !b.deletedAt;

/** A biodata in a personal list: the card when it is still public, otherwise only its number. */
function listEntry(b, extra = {}) {
  if (!b) return { unavailable: true, ...extra };
  return isPublic(b) ? { ...toCard(b), ...extra } : { biodataNo: b.biodataNo, unavailable: true, ...extra };
}

router.get('/dashboard', async (req, res) => {
  const uid = req.user._id;
  const b = await Biodata.findOne({ user: uid });
  const [stats, favoritedBy, favorites, dislikes, unlocks, sent, received, unread, openTickets, lastPurchase, recent] = await Promise.all([
    b ? visitStats(b._id) : { today: 0, week: 0, month: 0 },
    b ? Favorite.countDocuments({ biodata: b._id }) : 0,
    Favorite.countDocuments({ user: uid }),
    Dislike.countDocuments({ user: uid }),
    ContactUnlock.countDocuments({ user: uid }),
    Proposal.countDocuments({ from: uid }),
    Proposal.countDocuments({ to: uid }),
    Notification.countDocuments({ user: uid, readAt: null }),
    SupportTicket.countDocuments({ user: uid, status: { $ne: 'closed' } }),
    Payment.findOne({ user: uid, status: 'verified' }).sort({ creditedAt: -1 }).select('creditedAt connections').lean(),
    Proposal.find({ $or: [{ from: uid }, { to: uid }] }).sort({ createdAt: -1 }).limit(5).populate('fromBiodata toBiodata', 'biodataNo').lean(),
  ]);
  res.json({
    user: req.user.toSafeJSON(),
    biodata: b && {
      biodataNo: b.biodataNo,
      status: b.status,
      isHidden: b.isHidden,
      deletedAt: b.deletedAt,
      completion: b.completion,
      type: b.type,
      district: b.district,
      nidStatus: b.nid?.status ?? 'not_submitted',
      rejectionReason: b.rejectionReason ?? null,
    },
    connections: { balance: req.user.connectionBalance, used: req.user.connectionsUsed, purchased: req.user.connectionsPurchased, lastPurchaseAt: lastPurchase?.creditedAt ?? null },
    stats: { visits: stats, favoritedBy },
    counts: { favorites, dislikes, favoritedMe: favoritedBy, unlocks, sentProposals: sent, receivedProposals: received, unreadNotifications: unread, openTickets },
    recentProposals: recent.map((p) => {
      const outgoing = p.from.equals(uid);
      return { id: p._id, direction: outgoing ? 'sent' : 'received', status: p.status, createdAt: p.createdAt, biodataNo: outgoing ? p.toBiodata?.biodataNo : p.fromBiodata?.biodataNo ?? null };
    }),
  });
});

router.patch('/', async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(2).max(80).optional(), language: z.enum(['en', 'bn']).optional() }), req.body);
  Object.assign(req.user, body);
  await req.user.save();
  res.json({ user: req.user.toSafeJSON() });
});

router.post('/change-password', async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, 'Use at least 8 characters.').max(128) }), req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
    throw new ApiError(400, 'WRONG_PASSWORD', 'Your current password is incorrect.', { fields: { currentPassword: 'invalid' } });
  }
  user.passwordHash = await hashPassword(body.newPassword);
  await user.save();
  // Sign out every other device.
  await revokeAllSessions(user._id);
  await signIn(res, req, user);
  res.json({ ok: true });
});

router.delete('/', async (req, res) => {
  const body = parse(z.object({ password: z.string().min(1), reason: z.string().trim().max(500).optional() }), req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await verifyPassword(body.password, user.passwordHash))) {
    throw new ApiError(400, 'WRONG_PASSWORD', 'Your password is incorrect.', { fields: { password: 'invalid' } });
  }
  user.status = 'deactivated';
  user.deactivatedAt = new Date();
  user.statusReason = body.reason;
  await user.save();
  await Biodata.updateOne({ user: user._id, deletedAt: null }, { deletedAt: new Date(), deleteReason: 'other', deleteNote: 'Account deactivated' });
  await Proposal.updateMany({ from: user._id, status: 'pending' }, { status: 'withdrawn' });
  await revokeAllSessions(user._id);
  clearAuthCookies(res);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

function listRoute(Model) {
  return async (req, res) => {
    const p = pageParams(req.query, { defaultLimit: 24 });
    const filter = { user: req.user._id };
    const [rows, total] = await Promise.all([
      Model.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('biodata'),
      Model.countDocuments(filter),
    ]);
    res.json(paged(rows.map((r) => listEntry(r.biodata, { addedAt: r.createdAt })), total, p));
  };
}

router.get('/favorites', listRoute(Favorite));
router.get('/dislikes', listRoute(Dislike));

router.get('/favorited-me', async (req, res) => {
  const b = await Biodata.findOne({ user: req.user._id }).select('_id');
  const p = pageParams(req.query, { defaultLimit: 24 });
  if (!b) return res.json(paged([], 0, p));
  const filter = { biodata: b._id };
  const [rows, total] = await Promise.all([
    Favorite.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    Favorite.countDocuments(filter),
  ]);
  // Show the biodata of the person who favorited you, when they have a public one.
  const theirs = await Biodata.find({ user: { $in: rows.map((r) => r.user) } });
  const byUser = new Map(theirs.map((x) => [x.user.toString(), x]));
  res.json(paged(rows.map((r) => {
    const tb = byUser.get(r.user.toString());
    return tb && isPublic(tb) ? { ...toCard(tb), addedAt: r.createdAt } : { anonymous: true, addedAt: r.createdAt };
  }), total, p));
});

router.get('/unlocks', async (req, res) => {
  const p = pageParams(req.query, { defaultLimit: 24 });
  const filter = { user: req.user._id };
  const [rows, total] = await Promise.all([
    ContactUnlock.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('biodata'),
    ContactUnlock.countDocuments(filter),
  ]);
  // Paid contacts stay visible even if the biodata is later hidden.
  res.json(paged(rows.filter((r) => r.biodata).map((r) => ({
    ...toCard(r.biodata),
    unavailable: !isPublic(r.biodata),
    unlockedAt: r.createdAt,
    contact: r.biodata.contact?.toObject?.() ?? {},
  })), total, p));
});

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

router.get('/proposals', async (req, res) => {
  const box = req.query.box === 'sent' ? 'sent' : 'received';
  const filter = box === 'sent' ? { from: req.user._id } : { to: req.user._id };
  if (['pending', 'accepted', 'declined', 'withdrawn'].includes(req.query.status)) filter.status = req.query.status;
  const p = pageParams(req.query, { defaultLimit: 20 });
  const [rows, total] = await Promise.all([
    Proposal.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('fromBiodata toBiodata'),
    Proposal.countDocuments(filter),
  ]);
  res.json(paged(rows.map((r) => ({
    id: r._id,
    status: r.status,
    message: r.message ?? null,
    responseNote: r.responseNote ?? null,
    createdAt: r.createdAt,
    respondedAt: r.respondedAt ?? null,
    biodata: box === 'sent' ? listEntry(r.toBiodata) : (r.fromBiodata ? listEntry(r.fromBiodata) : null),
  })), total, p));
});

router.post('/proposals/:id/respond', async (req, res) => {
  assertObjectId(req.params.id, 'Proposal');
  const body = parse(z.object({ action: z.enum(['accept', 'decline']), note: z.string().trim().max(500).optional() }), req.body);
  const status = body.action === 'accept' ? 'accepted' : 'declined';
  const p = await Proposal.findOneAndUpdate(
    { _id: req.params.id, to: req.user._id, status: 'pending' },
    { status, respondedAt: new Date(), responseNote: body.note },
    { new: true },
  ).populate('toBiodata', 'biodataNo');
  if (!p) throw notFound('Proposal');
  await notify(p.from, `proposal_${status}`, { biodataNo: p.toBiodata?.biodataNo }, '/dashboard/proposals?box=sent');
  res.json({ id: p._id, status: p.status });
});

router.post('/proposals/:id/withdraw', async (req, res) => {
  assertObjectId(req.params.id, 'Proposal');
  const p = await Proposal.findOneAndUpdate({ _id: req.params.id, from: req.user._id, status: 'pending' }, { status: 'withdrawn' }, { new: true });
  if (!p) throw conflict('NOT_PENDING', 'Only pending proposals can be withdrawn.');
  res.json({ id: p._id, status: p.status });
});

// ---------------------------------------------------------------------------
// Notifications and connection history
// ---------------------------------------------------------------------------

router.get('/notifications', async (req, res) => {
  const p = pageParams(req.query, { defaultLimit: 20 });
  const filter = { user: req.user._id };
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, readAt: null }),
  ]);
  res.json({ ...paged(items, total, p), unread });
});

router.post('/notifications/read-all', async (req, res) => {
  await Notification.updateMany({ user: req.user._id, readAt: null }, { readAt: new Date() });
  res.json({ ok: true });
});

router.post('/notifications/:id/read', async (req, res) => {
  assertObjectId(req.params.id, 'Notification');
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { readAt: new Date() });
  res.json({ ok: true });
});

router.get('/connections', async (req, res) => {
  const p = pageParams(req.query, { defaultLimit: 20 });
  const filter = { user: req.user._id };
  const [ledger, total] = await Promise.all([
    ConnectionTransaction.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('biodata', 'biodataNo').populate('payment', 'invoiceNo method').lean(),
    ConnectionTransaction.countDocuments(filter),
  ]);
  res.json({
    balance: req.user.connectionBalance,
    purchased: req.user.connectionsPurchased,
    used: req.user.connectionsUsed,
    ledger: paged(ledger.map((t) => ({
      id: t._id, type: t.type, delta: t.delta, balanceAfter: t.balanceAfter, reason: t.reason ?? null, createdAt: t.createdAt,
      biodataNo: t.biodata?.biodataNo ?? null, invoiceNo: t.payment?.invoiceNo ?? null,
    })), total, p),
  });
});

export default router;
