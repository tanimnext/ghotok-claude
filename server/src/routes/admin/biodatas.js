import { Router } from 'express';
import { z } from 'zod';
import { SECTION_KEYS, biodataCompletion, validateBiodata, validateSection } from '@ghotok/shared';
import { audit, notify } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { assertObjectId, escapeRegex, pageParams, paged, parse } from '../../lib/http.js';
import { getSetting } from '../../lib/settings.js';
import { storage } from '../../lib/storage/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { Biodata, ContactUnlock, Favorite, Proposal, Report, RestoreRequest, User } from '../../models/index.js';
import { toFullView, visitStats } from '../../services/biodata.js';
import { biodataRow, userSummary } from './helpers.js';

const router = Router();

async function loadBiodata(id) {
  assertObjectId(id, 'Biodata');
  const b = await Biodata.findById(id).populate('user', 'name email phone role status');
  if (!b) throw notFound('Biodata');
  return b;
}

router.get('/biodatas', requirePermission('biodata.review'), async (req, res) => {
  const q = req.query;
  const filter = {};
  if (q.deleted === 'true') filter.deletedAt = { $ne: null };
  else if (q.deleted !== 'all') filter.deletedAt = null;
  if (['draft', 'pending', 'approved', 'rejected'].includes(q.status)) filter.status = q.status;
  if (['not_submitted', 'pending', 'verified', 'rejected'].includes(q.nid)) filter['nid.status'] = q.nid;
  if (q.type === 'bride' || q.type === 'groom') filter.type = q.type;
  if (q.religion) filter.religion = String(q.religion);
  if (q.hidden === 'true') filter.isHidden = true;
  if (q.blocked === 'true') filter.blocked = true;
  if (q.q) {
    const s = String(q.q).trim();
    const users = await User.find({ $or: [{ name: new RegExp(escapeRegex(s), 'i') }, { email: s.toLowerCase() }, { phone: s }] }).select('_id').limit(50);
    filter.$or = [{ biodataNo: new RegExp(`^${escapeRegex(s)}`, 'i') }, { user: { $in: users.map((u) => u._id) } }];
  }
  const p = pageParams(q, { defaultLimit: 20 });
  const sort = filter.status === 'pending' ? { submittedAt: 1 } : { updatedAt: -1 };
  const [items, total] = await Promise.all([
    Biodata.find(filter).sort(sort).skip(p.skip).limit(p.limit).populate('user', 'name email phone role status'),
    Biodata.countDocuments(filter),
  ]);
  res.json(paged(items.map(biodataRow), total, p));
});

router.get('/biodatas/:id', requirePermission('biodata.review'), async (req, res) => {
  const b = await loadBiodata(req.params.id);
  const [visits, favoritedBy, unlocks, proposals, reports, restore] = await Promise.all([
    visitStats(b._id),
    Favorite.countDocuments({ biodata: b._id }),
    ContactUnlock.countDocuments({ biodata: b._id }),
    Proposal.countDocuments({ toBiodata: b._id }),
    Report.find({ biodata: b._id }).sort({ createdAt: -1 }).limit(10).lean(),
    RestoreRequest.findOne({ biodata: b._id }).sort({ createdAt: -1 }).lean(),
  ]);
  res.json({
    biodata: { ...toFullView(b), deleteNote: b.deleteNote ?? null, reviewedAt: b.reviewedAt ?? null },
    completion: biodataCompletion(b.sectionsObject()),
    owner: userSummary(b.user),
    activity: { visits, favoritedBy, unlocks, proposals },
    reports: reports.map((r) => ({ id: r._id, reason: r.reason, status: r.status, createdAt: r.createdAt })),
    restoreRequest: restore,
  });
});

router.post('/biodatas/:id/approve', requirePermission('biodata.review'), async (req, res) => {
  const b = await loadBiodata(req.params.id);
  if (b.deletedAt) throw conflict('BIODATA_DELETED', 'Restore the biodata before approving it.');
  const errors = validateBiodata(b.sectionsObject());
  if (Object.keys(errors).length) throw badRequest('INCOMPLETE', 'This biodata is incomplete and cannot be approved.', { sections: errors });
  const moderation = await getSetting('moderation');
  if (moderation.requireNidForApproval && b.nid?.status !== 'verified') throw conflict('NID_REQUIRED', 'Verify the NID before approving.');
  const now = new Date();
  b.status = 'approved';
  b.approvedAt = now;
  b.firstApprovedAt ??= now;
  b.reviewedAt = now;
  b.reviewedBy = req.user._id;
  b.rejectionReason = undefined;
  await b.save();
  await notify(b.user._id, 'biodata_approved', { biodataNo: b.biodataNo }, `/biodatas/${b.biodataNo}`);
  await audit(req, 'biodata.approve', { targetType: 'biodata', targetId: b._id, summary: `Approved ${b.biodataNo}` });
  res.json({ biodata: biodataRow(b) });
});

router.post('/biodatas/:id/reject', requirePermission('biodata.review'), async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Tell the user what to change.').max(1000) }), req.body);
  const b = await loadBiodata(req.params.id);
  b.status = 'rejected';
  b.rejectionReason = reason;
  b.reviewedAt = new Date();
  b.reviewedBy = req.user._id;
  await b.save();
  await notify(b.user._id, 'biodata_rejected', { biodataNo: b.biodataNo, reason }, '/dashboard/biodata');
  await audit(req, 'biodata.reject', { targetType: 'biodata', targetId: b._id, summary: `Rejected ${b.biodataNo}`, meta: { reason } });
  res.json({ biodata: biodataRow(b) });
});

router.put('/biodatas/:id/sections/:section', requirePermission('biodata.edit'), async (req, res) => {
  if (!SECTION_KEYS.includes(req.params.section)) throw notFound('Section');
  const b = await loadBiodata(req.params.id);
  const { value, errors } = validateSection(req.params.section, req.body?.data ?? req.body, { biodata: b.sectionsObject(), partial: true });
  if (Object.keys(errors).length) throw badRequest('VALIDATION_ERROR', 'Please check the highlighted fields.', { fields: errors });
  b.set(req.params.section, value);
  await b.save();
  await audit(req, 'biodata.edit', { targetType: 'biodata', targetId: b._id, summary: `Edited ${req.params.section} of ${b.biodataNo}` });
  res.json({ biodata: toFullView(b), completion: biodataCompletion(b.sectionsObject()) });
});

router.post('/biodatas/:id/block', requirePermission('biodata.review'), async (req, res) => {
  const body = parse(z.object({ blocked: z.boolean(), reason: z.string().trim().max(500).optional() }), req.body);
  const b = await loadBiodata(req.params.id);
  b.blocked = body.blocked;
  await b.save();
  await audit(req, body.blocked ? 'biodata.block' : 'biodata.unblock', { targetType: 'biodata', targetId: b._id, summary: `${body.blocked ? 'Hid' : 'Unhid'} ${b.biodataNo}`, meta: { reason: body.reason } });
  res.json({ biodata: biodataRow(b) });
});

router.post('/biodatas/:id/delete', requirePermission('biodata.review'), async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }), req.body);
  const b = await loadBiodata(req.params.id);
  if (!b.deletedAt) {
    b.deletedAt = new Date();
    b.deleteReason = 'other';
    b.deleteNote = `Removed by staff: ${reason}`;
    await b.save();
    await Proposal.updateMany({ toBiodata: b._id, status: 'pending' }, { status: 'withdrawn' });
  }
  await audit(req, 'biodata.soft_delete', { targetType: 'biodata', targetId: b._id, summary: `Deleted ${b.biodataNo}`, meta: { reason } });
  res.json({ biodata: biodataRow(b) });
});

async function restoreBiodata(req, b, note) {
  b.deletedAt = null;
  b.deleteReason = undefined;
  b.deleteNote = undefined;
  await b.save();
  await RestoreRequest.updateMany({ biodata: b._id, status: 'pending' }, { status: 'approved', decidedBy: req.user._id, decidedAt: new Date(), note });
  await notify(b.user._id ?? b.user, 'restore_approved', { biodataNo: b.biodataNo }, '/dashboard');
  await audit(req, 'biodata.restore', { targetType: 'biodata', targetId: b._id, summary: `Restored ${b.biodataNo}` });
}

router.post('/biodatas/:id/restore', requirePermission('recovery.manage'), async (req, res) => {
  const b = await loadBiodata(req.params.id);
  if (!b.deletedAt) throw conflict('NOT_DELETED', 'This biodata is not deleted.');
  await restoreBiodata(req, b, req.body?.note);
  res.json({ biodata: biodataRow(b) });
});

// NID verification: reviewers see the documents through short-lived signed URLs.
router.get('/biodatas/:id/nid', requirePermission('nid.verify'), async (req, res) => {
  const b = await loadBiodata(req.params.id);
  if (!b.nid?.frontKey) throw notFound('NID documents');
  const [front, back] = await Promise.all([storage.privateUrl(b.nid.frontKey), storage.privateUrl(b.nid.backKey)]);
  await audit(req, 'nid.view', { targetType: 'biodata', targetId: b._id, summary: `Viewed NID of ${b.biodataNo}` });
  res.json({ status: b.nid.status, submittedAt: b.nid.submittedAt, front, back, note: b.nid.note ?? null });
});

async function decideNid(req, res, status) {
  const { note } = parse(z.object({ note: z.string().trim().max(500).optional() }), req.body);
  if (status === 'rejected' && !note) throw badRequest('VALIDATION_ERROR', 'Add a note for the user.', { fields: { note: 'required' } });
  const b = await loadBiodata(req.params.id);
  if (b.nid?.status !== 'pending') throw conflict('NOT_PENDING', 'There is no NID waiting for verification.');
  b.nid.status = status;
  b.nid.note = note;
  b.nid.reviewedAt = new Date();
  b.nid.reviewedBy = req.user._id;
  await b.save();
  await notify(b.user._id, status === 'verified' ? 'nid_verified' : 'nid_rejected', { biodataNo: b.biodataNo, note }, '/dashboard/biodata');
  await audit(req, `nid.${status === 'verified' ? 'verify' : 'reject'}`, { targetType: 'biodata', targetId: b._id, summary: `NID ${status} for ${b.biodataNo}`, meta: { note } });
  res.json({ biodata: biodataRow(b) });
}

router.post('/biodatas/:id/nid/verify', requirePermission('nid.verify'), (req, res) => decideNid(req, res, 'verified'));
router.post('/biodatas/:id/nid/reject', requirePermission('nid.verify'), (req, res) => decideNid(req, res, 'rejected'));

// Soft-delete recovery queue.
router.get('/restore-requests', requirePermission('recovery.manage'), async (req, res) => {
  const filter = {};
  if (['pending', 'approved', 'declined'].includes(req.query.status)) filter.status = req.query.status;
  const p = pageParams(req.query, { defaultLimit: 20 });
  const [items, total] = await Promise.all([
    RestoreRequest.find(filter).sort({ createdAt: filter.status === 'pending' ? 1 : -1 }).skip(p.skip).limit(p.limit)
      .populate('biodata', 'biodataNo deletedAt deleteReason deleteNote type').populate('user', 'name email phone role status').lean(),
    RestoreRequest.countDocuments(filter),
  ]);
  res.json(paged(items.map((r) => ({
    id: r._id, status: r.status, reason: r.reason ?? null, note: r.note ?? null, createdAt: r.createdAt, decidedAt: r.decidedAt ?? null,
    biodata: r.biodata ? { id: r.biodata._id, biodataNo: r.biodata.biodataNo, deletedAt: r.biodata.deletedAt, deleteReason: r.biodata.deleteReason, deleteNote: r.biodata.deleteNote ?? null } : null,
    user: userSummary(r.user),
  })), total, p));
});

router.post('/restore-requests/:id/approve', requirePermission('recovery.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'Request');
  const r = await RestoreRequest.findOne({ _id: req.params.id, status: 'pending' });
  if (!r) throw notFound('Request');
  const b = await Biodata.findById(r.biodata);
  if (!b) throw notFound('Biodata');
  await restoreBiodata(req, b, req.body?.note);
  res.json({ ok: true });
});

router.post('/restore-requests/:id/decline', requirePermission('recovery.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'Request');
  const { note } = parse(z.object({ note: z.string().trim().max(500).optional() }), req.body);
  const r = await RestoreRequest.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { status: 'declined', note, decidedBy: req.user._id, decidedAt: new Date() }, { new: true }).populate('biodata', 'biodataNo');
  if (!r) throw notFound('Request');
  await notify(r.user, 'restore_declined', { biodataNo: r.biodata?.biodataNo, note }, '/dashboard/settings');
  await audit(req, 'restore.decline', { targetType: 'restore_request', targetId: r._id, summary: `Declined restore of ${r.biodata?.biodataNo}` });
  res.json({ ok: true });
});

export default router;
