import crypto from 'node:crypto';
import { biodataCompletion, validateBiodata, validateSection } from '@ghotok/shared';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  photoUrl,
  signUploadToken,
  storage,
  verifyUploadToken,
} from '../integrations/storage/index.js';
import {
  Biodata,
  ContactUnlock,
  Dislike,
  Favorite,
  PUBLIC_FILTER,
  Proposal,
  RestoreRequest,
  nextSequence,
} from '../models/index.js';
import { toContact, toFullView } from '../serializers/biodata.serializer.js';
import { badRequest, conflict, notFound, validationError } from '../utils/api-error.js';
import { recordAudit } from './audit.service.js';
import { visitStats } from './visit.service.js';

// A member's own biodata, and the public view of other members' biodatas.

const FIRST_BIODATA_NO = 1000;

/** The owner's view plus the editor's completion summary. */
export const ownerView = (b) => ({
  biodata: toFullView(b),
  completion: biodataCompletion(b.sectionsObject()),
});

export function findOwn(userId) {
  return Biodata.findOne({ user: userId });
}

async function findOrCreateOwn(userId) {
  const existing = await findOwn(userId);
  if (existing) return existing;
  const seq = await nextSequence('biodata', FIRST_BIODATA_NO);
  return Biodata.create({ user: userId, biodataNo: `GH-${seq}` });
}

async function requireOwn(userId) {
  const b = await findOwn(userId);
  if (!b) throw notFound('Biodata');
  return b;
}

function assertEditable(b) {
  if (b.deletedAt) {
    throw conflict('BIODATA_DELETED', 'This biodata has been deleted. Request a restore to edit it again.');
  }
}

export const createOwn = (userId) => findOrCreateOwn(userId);

/**
 * Saves one form section. Missing required fields are allowed (drafts); invalid
 * values are not. Changing a live biodata sends it back to review.
 * @returns {Promise<{ biodata: object, statusChanged: boolean }>}
 */
export async function saveSection(userId, section, data) {
  const b = await findOrCreateOwn(userId);
  assertEditable(b);
  const { value, errors } = validateSection(section, data, { biodata: b.sectionsObject(), partial: true });
  if (Object.keys(errors).length) throw validationError(errors);

  b.set(section, value);
  const wasApproved = b.status === 'approved';
  if (wasApproved) {
    const { complete } = biodataCompletion(b.sectionsObject());
    b.status = complete ? 'pending' : 'draft';
    if (complete) b.submittedAt = new Date();
  }
  await b.save();
  return { biodata: b, statusChanged: wasApproved };
}

/** Submits a complete biodata for review. */
export async function submitForReview(userId) {
  const b = await requireOwn(userId);
  assertEditable(b);
  const errors = validateBiodata(b.sectionsObject());
  if (Object.keys(errors).length) {
    throw badRequest('INCOMPLETE', 'Please complete every section before submitting.', { sections: errors });
  }
  if (b.status === 'draft' || b.status === 'rejected') {
    b.status = 'pending';
    b.submittedAt = new Date();
    b.rejectionReason = undefined;
    await b.save();
  }
  return b;
}

export async function setHidden(userId, hidden) {
  const b = await requireOwn(userId);
  assertEditable(b);
  b.isHidden = hidden;
  await b.save();
  return b;
}

/** Soft-deletes the owner's biodata. It can be restored through the recovery queue. */
export async function softDeleteOwn(userId, { reason, note }, ctx) {
  const b = await requireOwn(userId);
  if (b.deletedAt) return b;
  b.deletedAt = new Date();
  b.deleteReason = reason;
  b.deleteNote = note;
  await b.save();
  await Proposal.updateMany({ from: userId, status: 'pending' }, { status: 'withdrawn' });
  await recordAudit(ctx, 'biodata.soft_delete', {
    targetType: 'biodata',
    targetId: b._id,
    summary: `${b.biodataNo} deleted by owner (${reason})`,
  });
  return b;
}

export async function latestRestoreRequest(userId) {
  const b = await findOwn(userId);
  return b ? RestoreRequest.findOne({ biodata: b._id }).sort({ createdAt: -1 }).lean() : null;
}

export async function requestRestore(userId, reason) {
  const b = await findOwn(userId);
  if (!b?.deletedAt) throw conflict('NOT_DELETED', 'Your biodata is not deleted.');
  if (await RestoreRequest.exists({ biodata: b._id, status: 'pending' })) {
    throw conflict('ALREADY_REQUESTED', 'You have already asked for a restore. Please wait for our team.');
  }
  return RestoreRequest.create({ biodata: b._id, user: userId, reason });
}

export async function ownStats(userId) {
  const b = await findOwn(userId);
  if (!b) return { visits: { today: 0, week: 0, month: 0 }, favoritedBy: 0, unlocks: 0, views: 0 };
  const [visits, favoritedBy] = await Promise.all([
    visitStats(b._id),
    Favorite.countDocuments({ biodata: b._id }),
  ]);
  return { visits, favoritedBy, unlocks: b.stats?.unlocks ?? 0, views: b.stats?.views ?? 0 };
}

// ----- Photo -----------------------------------------------------------------
// 1) the client asks for an upload URL, 2) uploads the file straight to storage,
// 3) attaches it with the signed ticket, which proves the upload was issued to them.

export async function createPhotoUpload(userId) {
  const upload = await storage.createPhotoUpload({ userId: String(userId) });
  const ticket = signUploadToken(
    { kind: 'ticket', imageId: upload.imageId, storage: upload.storage, userId: String(userId) },
    '30m',
  );
  return { ...upload, ticket, maxBytes: MAX_UPLOAD_BYTES, types: ALLOWED_IMAGE_TYPES };
}

export async function attachPhoto(userId, { ticket, visibility }) {
  const t = verifyUploadToken(ticket, 'ticket');
  if (!t?.imageId || t.userId !== String(userId)) {
    throw badRequest('BAD_TICKET', 'The upload has expired. Please try again.');
  }
  if (t.storage === 'local' && !(await storage.exists(`photos/${t.imageId}`))) {
    throw badRequest('UPLOAD_MISSING', 'We could not find the uploaded photo.');
  }
  const b = await findOrCreateOwn(userId);
  assertEditable(b);
  const previous = b.photo?.imageId;
  b.photo = {
    imageId: t.imageId,
    storage: t.storage,
    visibility: visibility ?? b.photo?.visibility ?? 'after_unlock',
  };
  await b.save();
  if (previous && previous !== t.imageId) await storage.deletePhoto(previous).catch(() => undefined);
  return b;
}

export async function setPhotoVisibility(userId, visibility) {
  const b = await findOwn(userId);
  if (!b?.photo?.imageId) throw notFound('Photo');
  b.photo.visibility = visibility;
  await b.save();
  return b;
}

export async function removePhoto(userId) {
  const b = await findOwn(userId);
  if (!b?.photo?.imageId) throw notFound('Photo');
  const { imageId } = b.photo;
  b.photo = undefined;
  await b.save();
  await storage.deletePhoto(imageId).catch(() => undefined);
  return b;
}

// ----- NID -------------------------------------------------------------------
// Both sides go to private storage; only reviewers can open them (short-lived URLs).

export async function createNidUpload(userId, { side, contentType }) {
  const key = `nid/${userId}/${crypto.randomUUID()}-${side}`;
  const upload = await storage.createPrivateUpload({ key, contentType, userId: String(userId) });
  const ticket = signUploadToken({ kind: 'ticket', key, userId: String(userId) }, '30m');
  return { ...upload, ticket, maxBytes: MAX_UPLOAD_BYTES };
}

export async function submitNid(userId, { frontTicket, backTicket }) {
  const keys = [frontTicket, backTicket].map((ticket) => {
    const t = verifyUploadToken(ticket, 'ticket');
    if (!t?.key || t.userId !== String(userId) || !t.key.startsWith(`nid/${userId}/`)) {
      throw badRequest('BAD_TICKET', 'The upload has expired. Please try again.');
    }
    return t.key;
  });
  for (const key of keys) {
    if (!(await storage.exists(key)))
      throw badRequest('UPLOAD_MISSING', 'We could not find the uploaded NID images.');
  }
  const b = await findOrCreateOwn(userId);
  assertEditable(b);
  if (b.nid?.status === 'verified') throw conflict('ALREADY_VERIFIED', 'Your NID is already verified.');
  const previous = [b.nid?.frontKey, b.nid?.backKey].filter(Boolean);
  b.nid = { status: 'pending', frontKey: keys[0], backKey: keys[1], submittedAt: new Date() };
  await b.save();
  await Promise.all(previous.map((k) => storage.deletePrivate(k).catch(() => undefined)));
  return b;
}

// ----- Public ------------------------------------------------------------------

/** Finds a public biodata by its number (e.g. "GH-1024") or throws 404. */
export async function findPublic(biodataNo) {
  const b = await Biodata.findOne({ biodataNo: String(biodataNo).toUpperCase(), ...PUBLIC_FILTER });
  if (!b) throw notFound('Biodata');
  return b;
}

/** Finds any biodata by number, public or not (for removing list entries, reports). */
export async function findByNumber(biodataNo) {
  const b = await Biodata.findOne({ biodataNo: String(biodataNo).toUpperCase() });
  if (!b) throw notFound('Biodata');
  return b;
}

export function assertNotOwn(b, user, message = 'This is your own biodata.') {
  if (b.user.equals(user._id)) throw badRequest('OWN_BIODATA', message);
}

/** What a signed-in member sees about a biodata: lists, unlock, contact, photo and proposal. */
export async function viewerState(user, biodataNo) {
  const b = await findPublic(biodataNo);
  const isOwner = b.user.equals(user._id);
  const [favorite, dislike, unlock, proposal] = await Promise.all([
    Favorite.exists({ user: user._id, biodata: b._id }),
    Dislike.exists({ user: user._id, biodata: b._id }),
    ContactUnlock.exists({ user: user._id, biodata: b._id }),
    Proposal.findOne({
      $or: [
        { from: user._id, toBiodata: b._id },
        { from: b.user, to: user._id },
      ],
      status: { $in: ['pending', 'accepted'] },
    }).sort({ createdAt: -1 }),
  ]);
  const unlocked = isOwner || !!unlock;
  const visibility = b.photo?.visibility;
  const showPhoto =
    !!b.photo?.imageId && (isOwner || visibility === 'public' || (unlocked && visibility === 'after_unlock'));
  return {
    isOwner,
    isFavorite: !!favorite,
    isDisliked: !!dislike,
    unlocked,
    contact: unlocked ? toContact(b) : null,
    photoUrl: showPhoto ? photoUrl(b.photo) : null,
    proposal: proposal
      ? {
          id: proposal._id,
          status: proposal.status,
          direction: proposal.from.equals(user._id) ? 'sent' : 'received',
        }
      : null,
    balance: user.connectionBalance,
  };
}
