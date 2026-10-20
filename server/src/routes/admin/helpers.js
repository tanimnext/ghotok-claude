import { ageFromDob } from '@ghotok/shared';
import { User } from '../../models/index.js';
import { notFound } from '../../lib/errors.js';
import { isValidEmail, isValidPhone, normalizePhone } from '@ghotok/shared';
import mongoose from 'mongoose';

export function userSummary(u) {
  if (!u) return null;
  return { id: u._id.toString(), name: u.name, email: u.email ?? null, phone: u.phone ?? null, role: u.role, status: u.status };
}

export function biodataRow(b) {
  return {
    id: b._id.toString(),
    biodataNo: b.biodataNo,
    status: b.status,
    type: b.type ?? null,
    religion: b.religion ?? null,
    maritalStatus: b.maritalStatus ?? null,
    district: b.district ?? null,
    age: ageFromDob(b.birthDate),
    completion: b.completion,
    nidStatus: b.nid?.status ?? 'not_submitted',
    isHidden: b.isHidden,
    blocked: !!b.blocked,
    deletedAt: b.deletedAt ?? null,
    deleteReason: b.deleteReason ?? null,
    submittedAt: b.submittedAt ?? null,
    approvedAt: b.approvedAt ?? null,
    updatedAt: b.updatedAt,
    views: b.stats?.views ?? 0,
    user: b.user && b.user.name ? userSummary(b.user) : null,
  };
}

/** Finds a user by id, email or phone number. */
export async function findUserByAny(ref) {
  const s = String(ref ?? '').trim();
  let user = null;
  if (mongoose.isValidObjectId(s)) user = await User.findById(s);
  else if (isValidEmail(s)) user = await User.findOne({ email: s.toLowerCase() });
  else if (isValidPhone(s)) user = await User.findOne({ phone: normalizePhone(s) });
  if (!user) throw notFound('User');
  return user;
}
