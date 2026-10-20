import { ageFromDob, publicSections } from '@ghotok/shared';
import { photoUrl } from '../lib/storage/index.js';
import { ProfileVisit } from '../models/index.js';

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** Summary used in search results, lists and the home page. No private data. */
export function toCard(b, { showPhoto = false } = {}) {
  return {
    id: b._id.toString(),
    biodataNo: b.biodataNo,
    type: b.type ?? null,
    age: ageFromDob(b.birthDate),
    maritalStatus: b.maritalStatus ?? null,
    religion: b.religion ?? null,
    heightIn: b.heightIn ?? null,
    complexion: b.complexion ?? null,
    district: b.district ?? null,
    division: b.division ?? null,
    educationLevel: b.educationLevel ?? null,
    institution: b.education?.institution ?? null,
    profession: b.profession ?? null,
    jobTitle: b.occupation?.jobTitle ?? null,
    nidVerified: b.nid?.status === 'verified',
    photoUrl: showPhoto || b.photo?.visibility === 'public' ? photoUrl(b.photo) : null,
    hasPhoto: !!b.photo?.imageId,
    approvedAt: b.approvedAt ?? null,
  };
}

/** Public profile: every non-private field. */
export function toPublicDetail(b) {
  return {
    ...toCard(b),
    sections: publicSections(b.sectionsObject ? b.sectionsObject() : b),
    views: b.stats?.views ?? 0,
    updatedAt: b.updatedAt,
  };
}

/** Everything the owner (or staff) may see. */
export function toFullView(b) {
  const sections = b.sectionsObject();
  return {
    ...toCard(b, { showPhoto: true }),
    status: b.status,
    rejectionReason: b.rejectionReason ?? null,
    submittedAt: b.submittedAt ?? null,
    isHidden: b.isHidden,
    blocked: !!b.blocked,
    deletedAt: b.deletedAt ?? null,
    deleteReason: b.deleteReason ?? null,
    completion: b.completion,
    photo: b.photo?.imageId ? { url: photoUrl(b.photo), visibility: b.photo.visibility } : null,
    nid: { status: b.nid?.status ?? 'not_submitted', submittedAt: b.nid?.submittedAt ?? null, note: b.nid?.note ?? null },
    stats: b.stats,
    sections,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

/** Records one visit per viewer per day (owner visits are not counted). */
export async function recordVisit(biodata, viewerKey) {
  if (!viewerKey) return false;
  try {
    await ProfileVisit.create({ biodata: biodata._id, viewerKey, day: dayKey() });
    await biodata.constructor.updateOne({ _id: biodata._id }, { $inc: { 'stats.views': 1 } });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

/** Visit counts for today, the last 7 days and the last 30 days. */
export async function visitStats(biodataId) {
  const now = Date.now();
  const since = (days) => dayKey(new Date(now - (days - 1) * 864e5));
  const [today, week, month] = await Promise.all([
    ProfileVisit.countDocuments({ biodata: biodataId, day: dayKey() }),
    ProfileVisit.countDocuments({ biodata: biodataId, day: { $gte: since(7) } }),
    ProfileVisit.countDocuments({ biodata: biodataId, day: { $gte: since(30) } }),
  ]);
  return { today, week, month };
}
