import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  DELETE_REASONS, EDUCATION_LEVELS, PHOTO_VISIBILITY, REPORT_REASONS, SECTION_KEYS,
  biodataCompletion, optionValues, validateBiodata, validateSection,
} from '@ghotok/shared';
import { ApiError, badRequest, conflict, notFound } from '../lib/errors.js';
import { csv, escapeRegex, pageParams, paged, parse } from '../lib/http.js';
import { audit, notify } from '../lib/audit.js';
import { ALLOWED_IMAGE_TYPES, photoUrl, signUploadToken, storage, verifyUploadToken } from '../lib/storage/index.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/security.js';
import {
  Biodata, ContactUnlock, Dislike, Favorite, PUBLIC_FILTER, Proposal, Report, RestoreRequest, nextSequence,
} from '../models/index.js';
import { recordVisit, toCard, toFullView, toPublicDetail, visitStats } from '../services/biodata.js';
import { unlockContact } from '../services/connections.js';

const router = Router();

const VISITOR_COOKIE = 'gh_vid';

async function ownBiodata(user, { create = false } = {}) {
  let b = await Biodata.findOne({ user: user._id });
  if (!b && create) {
    const seq = await nextSequence('biodata', 1000);
    b = await Biodata.create({ user: user._id, biodataNo: `GH-${seq}` });
  }
  return b;
}

function ownerResponse(b) {
  return { biodata: toFullView(b), completion: biodataCompletion(b.sectionsObject()) };
}

function assertEditable(b) {
  if (b.deletedAt) throw conflict('BIODATA_DELETED', 'This biodata has been deleted. Request a restore to edit it again.');
}

// ---------------------------------------------------------------------------
// Owner: create, edit, submit, hide, delete, restore, photo, NID
// ---------------------------------------------------------------------------

router.get('/me', requireAuth, async (req, res) => {
  const b = await ownBiodata(req.user);
  if (!b) return res.json({ biodata: null, completion: biodataCompletion({}) });
  res.json(ownerResponse(b));
});

router.post('/me', requireAuth, requireVerified, async (req, res) => {
  const b = await ownBiodata(req.user, { create: true });
  res.status(201).json(ownerResponse(b));
});

router.put('/me/sections/:section', requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const { section } = req.params;
  if (!SECTION_KEYS.includes(section)) throw notFound('Section');
  const b = await ownBiodata(req.user, { create: true });
  assertEditable(b);
  const { value, errors } = validateSection(section, req.body?.data ?? req.body, { biodata: b.sectionsObject(), partial: true });
  if (Object.keys(errors).length) throw badRequest('VALIDATION_ERROR', 'Please check the highlighted fields.', { fields: errors });

  b.set(section, value);
  const wasApproved = b.status === 'approved';
  if (wasApproved) {
    // Changes to a live biodata are reviewed again before they are shown.
    const complete = biodataCompletion(b.sectionsObject()).complete;
    b.status = complete ? 'pending' : 'draft';
    b.submittedAt = complete ? new Date() : b.submittedAt;
  }
  await b.save();
  res.json({ ...ownerResponse(b), statusChanged: wasApproved });
});

router.post('/me/submit', requireAuth, requireVerified, async (req, res) => {
  const b = await ownBiodata(req.user);
  if (!b) throw notFound('Biodata');
  assertEditable(b);
  const errors = validateBiodata(b.sectionsObject());
  if (Object.keys(errors).length) throw badRequest('INCOMPLETE', 'Please complete every section before submitting.', { sections: errors });
  if (b.status === 'approved' || b.status === 'pending') return res.json(ownerResponse(b));
  b.status = 'pending';
  b.submittedAt = new Date();
  b.rejectionReason = undefined;
  await b.save();
  res.json(ownerResponse(b));
});

router.patch('/me/visibility', requireAuth, async (req, res) => {
  const { hidden } = parse(z.object({ hidden: z.boolean() }), req.body);
  const b = await ownBiodata(req.user);
  if (!b) throw notFound('Biodata');
  assertEditable(b);
  b.isHidden = hidden;
  await b.save();
  res.json(ownerResponse(b));
});

router.delete('/me', requireAuth, async (req, res) => {
  const body = parse(z.object({
    reason: z.enum(optionValues(DELETE_REASONS)),
    note: z.string().trim().max(500).optional(),
  }), req.body);
  const b = await ownBiodata(req.user);
  if (!b) throw notFound('Biodata');
  if (b.deletedAt) return res.json(ownerResponse(b));
  b.deletedAt = new Date();
  b.deleteReason = body.reason;
  b.deleteNote = body.note;
  await b.save();
  await Proposal.updateMany({ from: req.user._id, status: 'pending' }, { status: 'withdrawn' });
  await audit(req, 'biodata.soft_delete', { targetType: 'biodata', targetId: b._id, summary: `${b.biodataNo} deleted by owner (${body.reason})` });
  res.json(ownerResponse(b));
});

router.get('/me/restore-request', requireAuth, async (req, res) => {
  const b = await ownBiodata(req.user);
  const request = b ? await RestoreRequest.findOne({ biodata: b._id }).sort({ createdAt: -1 }).lean() : null;
  res.json({ request });
});

router.post('/me/restore-request', requireAuth, async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().max(1000).optional() }), req.body);
  const b = await ownBiodata(req.user);
  if (!b?.deletedAt) throw conflict('NOT_DELETED', 'Your biodata is not deleted.');
  if (await RestoreRequest.exists({ biodata: b._id, status: 'pending' })) throw conflict('ALREADY_REQUESTED', 'You have already asked for a restore. Please wait for our team.');
  const request = await RestoreRequest.create({ biodata: b._id, user: req.user._id, reason });
  res.status(201).json({ request });
});

router.get('/me/stats', requireAuth, async (req, res) => {
  const b = await ownBiodata(req.user);
  if (!b) return res.json({ visits: { today: 0, week: 0, month: 0 }, favoritedBy: 0, unlocks: 0 });
  const [visits, favoritedBy] = await Promise.all([visitStats(b._id), Favorite.countDocuments({ biodata: b._id })]);
  res.json({ visits, favoritedBy, unlocks: b.stats?.unlocks ?? 0, views: b.stats?.views ?? 0 });
});

// Photo: request an upload URL, upload the file directly to storage, then attach it.
router.post('/me/photo/upload-url', requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const upload = await storage.createPhotoUpload({ userId: req.user._id.toString() });
  const ticket = signUploadToken({ kind: 'ticket', imageId: upload.imageId, storage: upload.storage, userId: req.user._id.toString() }, '30m');
  res.json({ ...upload, ticket, maxBytes: 5 * 1024 * 1024, types: ALLOWED_IMAGE_TYPES });
});

router.post('/me/photo', requireAuth, requireVerified, async (req, res) => {
  const body = parse(z.object({ ticket: z.string(), visibility: z.enum(optionValues(PHOTO_VISIBILITY)).optional() }), req.body);
  const t = verifyUploadToken(body.ticket, 'ticket');
  if (!t?.imageId || t.userId !== req.user._id.toString()) throw badRequest('BAD_TICKET', 'The upload has expired. Please try again.');
  if (t.storage === 'local' && !(await storage.exists(`photos/${t.imageId}`))) throw badRequest('UPLOAD_MISSING', 'We could not find the uploaded photo.');
  const b = await ownBiodata(req.user, { create: true });
  assertEditable(b);
  const old = b.photo?.imageId ? { ...b.photo.toObject() } : null;
  b.photo = { imageId: t.imageId, storage: t.storage, visibility: body.visibility ?? b.photo?.visibility ?? 'after_unlock' };
  await b.save();
  if (old && old.imageId !== t.imageId) await storage.deletePhoto(old.imageId).catch(() => undefined);
  res.json(ownerResponse(b));
});

router.patch('/me/photo', requireAuth, async (req, res) => {
  const { visibility } = parse(z.object({ visibility: z.enum(optionValues(PHOTO_VISIBILITY)) }), req.body);
  const b = await ownBiodata(req.user);
  if (!b?.photo?.imageId) throw notFound('Photo');
  b.photo.visibility = visibility;
  await b.save();
  res.json(ownerResponse(b));
});

router.delete('/me/photo', requireAuth, async (req, res) => {
  const b = await ownBiodata(req.user);
  if (!b?.photo?.imageId) throw notFound('Photo');
  const { imageId } = b.photo;
  b.photo = undefined;
  await b.save();
  await storage.deletePhoto(imageId).catch(() => undefined);
  res.json(ownerResponse(b));
});

// NID: the front and back images go to private storage and are only visible to reviewers.
router.post('/me/nid/upload-url', requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const body = parse(z.object({ side: z.enum(['front', 'back']), contentType: z.enum(ALLOWED_IMAGE_TYPES) }), req.body);
  const key = `nid/${req.user._id}/${crypto.randomUUID()}-${body.side}`;
  const upload = await storage.createPrivateUpload({ key, contentType: body.contentType, userId: req.user._id.toString() });
  const ticket = signUploadToken({ kind: 'ticket', key, userId: req.user._id.toString() }, '30m');
  res.json({ ...upload, ticket, maxBytes: 5 * 1024 * 1024 });
});

router.post('/me/nid', requireAuth, requireVerified, async (req, res) => {
  const body = parse(z.object({ frontTicket: z.string(), backTicket: z.string() }), req.body);
  const keys = [body.frontTicket, body.backTicket].map((tk) => {
    const t = verifyUploadToken(tk, 'ticket');
    if (!t?.key || t.userId !== req.user._id.toString() || !t.key.startsWith(`nid/${req.user._id}/`)) {
      throw badRequest('BAD_TICKET', 'The upload has expired. Please try again.');
    }
    return t.key;
  });
  for (const key of keys) {
    if (!(await storage.exists(key))) throw badRequest('UPLOAD_MISSING', 'We could not find the uploaded NID images.');
  }
  const b = await ownBiodata(req.user, { create: true });
  assertEditable(b);
  if (b.nid?.status === 'verified') throw conflict('ALREADY_VERIFIED', 'Your NID is already verified.');
  const old = [b.nid?.frontKey, b.nid?.backKey].filter(Boolean);
  b.nid = { status: 'pending', frontKey: keys[0], backKey: keys[1], submittedAt: new Date() };
  await b.save();
  await Promise.all(old.map((k) => storage.deletePrivate(k).catch(() => undefined)));
  res.json(ownerResponse(b));
});

// ---------------------------------------------------------------------------
// Public: search, featured, detail
// ---------------------------------------------------------------------------

const yearsAgo = (years) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
};

export function buildSearchFilter(q) {
  const filter = { ...PUBLIC_FILTER };
  if (q.type === 'bride' || q.type === 'groom') filter.type = q.type;
  const lists = { religion: 'religion', marital: 'maritalStatus', complexion: 'complexion', profession: 'profession', economic: 'economicStatus', division: 'division', district: 'district' };
  for (const [param, field] of Object.entries(lists)) {
    const values = csv(q[param]).slice(0, 70);
    if (values.length) filter[field] = { $in: values };
  }
  const ageMin = Number.parseInt(q.ageMin, 10);
  const ageMax = Number.parseInt(q.ageMax, 10);
  if (ageMin || ageMax) {
    filter.birthDate = {};
    if (ageMin) filter.birthDate.$lte = yearsAgo(ageMin);
    if (ageMax) filter.birthDate.$gt = yearsAgo(ageMax + 1);
  }
  const hMin = Number.parseInt(q.heightMin, 10);
  const hMax = Number.parseInt(q.heightMax, 10);
  if (hMin || hMax) {
    filter.heightIn = {};
    if (hMin) filter.heightIn.$gte = hMin;
    if (hMax) filter.heightIn.$lte = hMax;
  }
  if (q.education) {
    const rank = EDUCATION_LEVELS.findIndex((e) => e.value === q.education);
    if (rank >= 0) filter.educationRank = { $gte: rank };
  }
  if (q.nid === 'verified') filter['nid.status'] = 'verified';
  if (q.q) {
    const digits = String(q.q).replace(/\D/g, '').slice(0, 10);
    if (digits) filter.biodataNo = new RegExp(`^GH-${escapeRegex(digits)}`, 'i');
  }
  return filter;
}

const SORTS = {
  newest: { approvedAt: -1, _id: -1 },
  age_asc: { birthDate: -1, _id: -1 },
  age_desc: { birthDate: 1, _id: -1 },
};

router.get('/', async (req, res) => {
  const filter = buildSearchFilter(req.query);
  if (req.user) {
    const disliked = await Dislike.find({ user: req.user._id }).distinct('biodata');
    filter._id = { $nin: disliked };
    filter.user = { $ne: req.user._id };
  }
  const p = pageParams(req.query, { defaultLimit: 12, maxLimit: 48 });
  const sort = SORTS[req.query.sort] ?? SORTS.newest;
  const [items, total] = await Promise.all([
    Biodata.find(filter).sort(sort).skip(p.skip).limit(p.limit),
    Biodata.countDocuments(filter),
  ]);
  res.json(paged(items.map((b) => toCard(b)), total, p));
});

router.get('/featured', async (req, res) => {
  const limit = Math.min(12, Number.parseInt(req.query.limit, 10) || 4);
  const items = await Biodata.find(PUBLIC_FILTER).sort({ approvedAt: -1 }).limit(limit);
  res.json({ items: items.map((b) => toCard(b)) });
});

async function publicBiodata(no) {
  const b = await Biodata.findOne({ biodataNo: String(no).toUpperCase(), ...PUBLIC_FILTER });
  if (!b) throw notFound('Biodata');
  return b;
}

router.get('/:no', async (req, res) => {
  const b = await publicBiodata(req.params.no);
  res.json({ biodata: toPublicDetail(b) });
});

router.post('/:no/visit', async (req, res) => {
  const b = await publicBiodata(req.params.no);
  if (req.user && b.user.equals(req.user._id)) return res.json({ counted: false });
  let viewerKey = req.user ? `u:${req.user._id}` : null;
  if (!viewerKey) {
    let vid = req.cookies?.[VISITOR_COOKIE];
    if (!vid || !/^[\w-]{20,64}$/.test(vid)) {
      vid = crypto.randomUUID();
      res.cookie(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: 'lax', maxAge: 400 * 864e5, path: '/' });
    }
    viewerKey = `v:${vid}`;
  }
  res.json({ counted: await recordVisit(b, viewerKey) });
});

function contactOf(b) {
  const c = b.contact?.toObject ? b.contact.toObject() : (b.contact ?? {});
  return { ...c };
}

router.get('/:no/viewer', requireAuth, async (req, res) => {
  const b = await publicBiodata(req.params.no);
  const isOwner = b.user.equals(req.user._id);
  const [fav, dis, unlock, proposal] = await Promise.all([
    Favorite.exists({ user: req.user._id, biodata: b._id }),
    Dislike.exists({ user: req.user._id, biodata: b._id }),
    ContactUnlock.exists({ user: req.user._id, biodata: b._id }),
    Proposal.findOne({
      $or: [{ from: req.user._id, toBiodata: b._id }, { from: b.user, to: req.user._id }],
      status: { $in: ['pending', 'accepted'] },
    }).sort({ createdAt: -1 }),
  ]);
  const unlocked = isOwner || !!unlock;
  const showPhoto = b.photo?.imageId && (isOwner || b.photo.visibility === 'public' || (unlocked && b.photo.visibility === 'after_unlock'));
  res.json({
    isOwner,
    isFavorite: !!fav,
    isDisliked: !!dis,
    unlocked,
    contact: unlocked ? contactOf(b) : null,
    photoUrl: showPhoto ? photoUrl(b.photo) : null,
    proposal: proposal ? { id: proposal._id, status: proposal.status, direction: proposal.from.equals(req.user._id) ? 'sent' : 'received' } : null,
    balance: req.user.connectionBalance,
  });
});

router.post('/:no/unlock', requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const b = await publicBiodata(req.params.no);
  if (b.user.equals(req.user._id)) throw badRequest('OWN_BIODATA', 'This is your own biodata.');
  const result = await unlockContact(req.user, b);
  if (result.charged) {
    await notify(b.user, 'contact_unlocked', { biodataNo: b.biodataNo });
  }
  const showPhoto = b.photo?.imageId && b.photo.visibility !== 'hidden';
  res.json({
    unlocked: true,
    charged: result.charged,
    balance: result.balance,
    contact: contactOf(b),
    photoUrl: showPhoto ? photoUrl(b.photo) : null,
  });
});

function listToggle(Model, { counter } = {}) {
  return {
    add: async (req, res) => {
      const b = await publicBiodata(req.params.no);
      if (b.user.equals(req.user._id)) throw badRequest('OWN_BIODATA', 'This is your own biodata.');
      const result = await Model.updateOne({ user: req.user._id, biodata: b._id }, { $setOnInsert: { user: req.user._id, biodata: b._id } }, { upsert: true });
      if (result.upsertedCount) {
        // Favoriting and disliking the same biodata at once makes no sense.
        const Other = Model === Favorite ? Dislike : Favorite;
        const removed = await Other.deleteOne({ user: req.user._id, biodata: b._id });
        if (counter) await Biodata.updateOne({ _id: b._id }, { $inc: { [counter]: 1 } });
        if (Model === Dislike && removed.deletedCount) await Biodata.updateOne({ _id: b._id }, { $inc: { 'stats.favorites': -1 } });
        if (Model === Favorite) await notify(b.user, 'favorited', { biodataNo: b.biodataNo }, '/dashboard/favorited-me');
      }
      res.json({ ok: true });
    },
    remove: async (req, res) => {
      const b = await Biodata.findOne({ biodataNo: String(req.params.no).toUpperCase() });
      if (!b) throw notFound('Biodata');
      const result = await Model.deleteOne({ user: req.user._id, biodata: b._id });
      if (result.deletedCount && counter) await Biodata.updateOne({ _id: b._id }, { $inc: { [counter]: -1 } });
      res.json({ ok: true });
    },
  };
}

const fav = listToggle(Favorite, { counter: 'stats.favorites' });
const dis = listToggle(Dislike);
router.post('/:no/favorite', requireAuth, writeLimiter, fav.add);
router.delete('/:no/favorite', requireAuth, fav.remove);
router.post('/:no/dislike', requireAuth, writeLimiter, dis.add);
router.delete('/:no/dislike', requireAuth, dis.remove);

router.post('/:no/proposals', requireAuth, requireVerified, writeLimiter, async (req, res) => {
  const { message } = parse(z.object({ message: z.string().trim().max(1000).optional() }), req.body);
  const b = await publicBiodata(req.params.no);
  if (b.user.equals(req.user._id)) throw badRequest('OWN_BIODATA', 'You cannot send a proposal to your own biodata.');
  const active = await Proposal.exists({ from: req.user._id, toBiodata: b._id, status: { $in: ['pending', 'accepted'] } });
  if (active) throw conflict('PROPOSAL_EXISTS', 'You have already sent a proposal to this biodata.');
  const today = await Proposal.countDocuments({ from: req.user._id, createdAt: { $gte: new Date(Date.now() - 864e5) } });
  if (today >= 20) throw new ApiError(429, 'PROPOSAL_LIMIT', 'You can send up to 20 proposals a day.');
  const mine = await Biodata.findOne({ user: req.user._id, deletedAt: null }).select('_id biodataNo');
  const proposal = await Proposal.create({ from: req.user._id, fromBiodata: mine?._id, to: b.user, toBiodata: b._id, message });
  await notify(b.user, 'proposal_received', { fromBiodataNo: mine?.biodataNo ?? null }, '/dashboard/proposals?box=received');
  res.status(201).json({ proposal: { id: proposal._id, status: proposal.status, direction: 'sent' } });
});

router.post('/:no/report', requireAuth, writeLimiter, async (req, res) => {
  const body = parse(z.object({ reason: z.enum(optionValues(REPORT_REASONS)), details: z.string().trim().max(2000).optional() }), req.body);
  const b = await Biodata.findOne({ biodataNo: String(req.params.no).toUpperCase() });
  if (!b) throw notFound('Biodata');
  if (await Report.exists({ reporter: req.user._id, biodata: b._id, status: { $in: ['open', 'in_review'] } })) {
    throw conflict('ALREADY_REPORTED', 'You have already reported this biodata. Our team is looking into it.');
  }
  const report = await Report.create({ reporter: req.user._id, biodata: b._id, targetUser: b.user, ...body });
  res.status(201).json({ report: { id: report._id, status: report.status } });
});

export default router;
