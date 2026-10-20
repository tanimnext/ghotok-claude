import { Report } from '../models/index.js';
import { toAdminRow } from '../serializers/biodata.serializer.js';
import { toUserSummary } from '../serializers/user.serializer.js';
import { conflict, notFound } from '../utils/api-error.js';
import { pageParams, paged } from '../utils/pagination.js';
import { recordAudit } from './audit.service.js';
import { findByNumber } from './biodata.service.js';
import { notify } from './notification.service.js';

const ACTIVE = ['open', 'in_review'];

/** A member reports a biodata (and its owner). One active report per member per biodata. */
export async function reportBiodata(user, biodataNo, { reason, details }) {
  const b = await findByNumber(biodataNo);
  if (await Report.exists({ reporter: user._id, biodata: b._id, status: { $in: ACTIVE } })) {
    throw conflict(
      'ALREADY_REPORTED',
      'You have already reported this biodata. Our team is looking into it.',
    );
  }
  const report = await Report.create({
    reporter: user._id,
    biodata: b._id,
    targetUser: b.user,
    reason,
    details,
  });
  return { id: report._id, status: report.status };
}

/** Staff: reports, newest first, with how often each target has been reported. */
export async function listReports({ status }, query) {
  const filter = {};
  if (status === 'active') filter.status = { $in: ACTIVE };
  else if (status) filter.status = status;
  const params = pageParams(query, { defaultLimit: 20 });
  const [items, total] = await Promise.all([
    Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(params.skip)
      .limit(params.limit)
      .populate('reporter', 'name email phone role status')
      .populate('targetUser', 'name email phone role status')
      .populate('biodata')
      .populate('handledBy', 'name'),
    Report.countDocuments(filter),
  ]);
  const counts = await Report.aggregate([
    { $match: { targetUser: { $in: items.map((r) => r.targetUser?._id).filter(Boolean) } } },
    { $group: { _id: '$targetUser', n: { $sum: 1 } } },
  ]);
  const countOf = new Map(counts.map((c) => [c._id.toString(), c.n]));
  return paged(
    items.map((r) => ({
      id: r._id,
      reason: r.reason,
      details: r.details ?? null,
      status: r.status,
      actionTaken: r.actionTaken ?? null,
      createdAt: r.createdAt,
      handledAt: r.handledAt ?? null,
      handledBy: r.handledBy?.name ?? null,
      reporter: toUserSummary(r.reporter),
      targetUser: toUserSummary(r.targetUser),
      timesReported: r.targetUser ? (countOf.get(r.targetUser._id.toString()) ?? 1) : 1,
      biodata: r.biodata ? toAdminRow(r.biodata) : null,
    })),
    total,
    params,
  );
}

/** Staff: move a report through open → in_review → resolved | dismissed. */
export async function updateReport(id, { status, actionTaken }, ctx) {
  const closing = status === 'resolved' || status === 'dismissed';
  const update = {
    status,
    actionTaken,
    ...(closing ? { handledBy: ctx.actor._id, handledAt: new Date() } : {}),
  };
  const r = await Report.findByIdAndUpdate(id, update, { new: true }).populate('biodata', 'biodataNo');
  if (!r) throw notFound('Report');
  if (closing) await notify(r.reporter, 'report_closed', { biodataNo: r.biodata?.biodataNo, status });
  await recordAudit(ctx, 'report.update', {
    targetType: 'report',
    targetId: r._id,
    summary: `Report on ${r.biodata?.biodataNo ?? 'user'} → ${status}`,
    meta: { status, actionTaken },
  });
}
