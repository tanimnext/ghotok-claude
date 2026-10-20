import { EDUCATION_LEVELS } from '@ghotok/shared';
import { Biodata, Dislike, PUBLIC_FILTER } from '../models/index.js';
import { toCard } from '../serializers/biodata.serializer.js';
import { pageParams, paginate } from '../utils/pagination.js';
import { csv, escapeRegex } from '../utils/strings.js';

// Public biodata search. Every filter maps to an indexed, denormalised field on
// the Biodata model (see biodata.model.js, "Denormalised search fields").

const LIST_FILTERS = {
  religion: 'religion',
  marital: 'maritalStatus',
  complexion: 'complexion',
  profession: 'profession',
  economic: 'economicStatus',
  division: 'division',
  district: 'district',
};

const SORTS = {
  newest: { approvedAt: -1, _id: -1 },
  age_asc: { birthDate: -1, _id: -1 },
  age_desc: { birthDate: 1, _id: -1 },
};

const yearsAgo = (years) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
};

const int = (v) => Number.parseInt(v, 10) || 0;

/** Builds the MongoDB filter for a search query. Exported for tests. */
export function buildSearchFilter(q) {
  const filter = { ...PUBLIC_FILTER };
  if (q.type === 'bride' || q.type === 'groom') filter.type = q.type;
  for (const [param, field] of Object.entries(LIST_FILTERS)) {
    const values = csv(q[param]).slice(0, 70);
    if (values.length) filter[field] = { $in: values };
  }
  // Age is stored as a birth date, so an age range becomes a birth-date range.
  const ageMin = int(q.ageMin);
  const ageMax = int(q.ageMax);
  if (ageMin || ageMax) {
    filter.birthDate = {};
    if (ageMin) filter.birthDate.$lte = yearsAgo(ageMin);
    if (ageMax) filter.birthDate.$gt = yearsAgo(ageMax + 1);
  }
  const heightMin = int(q.heightMin);
  const heightMax = int(q.heightMax);
  if (heightMin || heightMax) {
    filter.heightIn = {};
    if (heightMin) filter.heightIn.$gte = heightMin;
    if (heightMax) filter.heightIn.$lte = heightMax;
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

/**
 * Searches public biodatas. Signed-in members never see their own biodata or
 * biodatas they marked "not interested".
 */
export async function searchBiodatas(query, viewer) {
  const filter = buildSearchFilter(query);
  if (viewer) {
    filter._id = { $nin: await Dislike.find({ user: viewer._id }).distinct('biodata') };
    filter.user = { $ne: viewer._id };
  }
  const params = pageParams(query, { defaultLimit: 12, maxLimit: 48 });
  const sort = SORTS[query.sort] ?? SORTS.newest;
  return paginate(Biodata.find(filter).sort(sort), Biodata.countDocuments(filter), params, (b) => toCard(b));
}

/** The most recently approved biodatas, for the home page. */
export async function featuredBiodatas(limit = 4) {
  const items = await Biodata.find(PUBLIC_FILTER).sort({ approvedAt: -1 }).limit(Math.min(12, limit));
  return items.map((b) => toCard(b));
}
