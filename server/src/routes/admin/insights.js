import { Router } from 'express';
import { can } from '@ghotok/shared';
import { escapeRegex, pageParams, paged } from '../../lib/http.js';
import { requirePermission } from '../../middleware/auth.js';
import {
  AuditLog, Biodata, ConnectionTransaction, ContactMessage, Payment, ProfileVisit, RefundRequest, Report, RestoreRequest, SupportTicket, User,
} from '../../models/index.js';
import { toPaymentJSON } from '../billing.js';
import { biodataRow, userSummary } from './helpers.js';

const router = Router();
const TZ = 'Asia/Dhaka';

router.get('/overview', requirePermission('overview.view'), async (req, res) => {
  const finance = can(req.user.role, 'payments.manage');
  const since30 = new Date(Date.now() - 30 * 864e5);
  const [pendingBiodatas, pendingNid, openReports, pendingRestores, openTickets, newMessages, reports, restores, biodatas] = await Promise.all([
    Biodata.countDocuments({ status: 'pending', deletedAt: null }),
    Biodata.countDocuments({ 'nid.status': 'pending', deletedAt: null }),
    Report.countDocuments({ status: { $in: ['open', 'in_review'] } }),
    RestoreRequest.countDocuments({ status: 'pending' }),
    SupportTicket.countDocuments({ status: { $in: ['open', 'waiting'] } }),
    ContactMessage.countDocuments({ status: 'new' }),
    Report.find({ status: { $in: ['open', 'in_review'] } }).sort({ createdAt: -1 }).limit(5).populate('biodata', 'biodataNo').populate('targetUser', 'name').lean(),
    RestoreRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(5).populate('biodata', 'biodataNo deletedAt').lean(),
    Biodata.find({ status: 'pending', deletedAt: null }).sort({ submittedAt: 1 }).limit(5).populate('user', 'name email phone role status'),
  ]);
  const out = {
    kpis: { pendingBiodatas, pendingNid, openReports, pendingRestores, openTickets, newMessages },
    reports: reports.map((r) => ({ id: r._id, reason: r.reason, status: r.status, createdAt: r.createdAt, biodataNo: r.biodata?.biodataNo ?? null, targetName: r.targetUser?.name ?? null })),
    restores: restores.map((r) => ({ id: r._id, createdAt: r.createdAt, biodataNo: r.biodata?.biodataNo ?? null, deletedAt: r.biodata?.deletedAt ?? null })),
    biodatas: biodatas.map(biodataRow),
  };
  if (finance) {
    const [pendingPayments, pendingRefunds, revenue, payments] = await Promise.all([
      Payment.countDocuments({ status: 'pending' }),
      RefundRequest.countDocuments({ status: 'pending' }),
      Payment.aggregate([{ $match: { status: 'verified', creditedAt: { $gte: since30 } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Payment.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(6).populate('user', 'name email phone role status'),
    ]);
    Object.assign(out.kpis, { pendingPayments, pendingRefunds, revenue30: revenue[0]?.total ?? 0 });
    out.payments = payments.map((p) => ({ ...toPaymentJSON(p), user: userSummary(p.user) }));
  }
  res.json(out);
});

function dailySeries(days) {
  const out = [];
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  for (let i = days - 1; i >= 0; i -= 1) out.push(fmt.format(new Date(Date.now() - i * 864e5)));
  return out;
}

const byDay = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: TZ } });

async function countByDay(Model, dateField, match, since, sumField) {
  const rows = await Model.aggregate([
    { $match: { ...match, [dateField]: { $gte: since } } },
    { $group: { _id: byDay(dateField), n: { $sum: sumField ? `$${sumField}` : 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

router.get('/analytics', requirePermission('analytics.view'), async (req, res) => {
  const days = Math.min(365, Math.max(7, Number.parseInt(req.query.days, 10) || 30));
  const since = new Date(Date.now() - days * 864e5);
  const [revenue, sales, signups, submissions, approvals, unlocks, visits] = await Promise.all([
    countByDay(Payment, 'creditedAt', { status: { $in: ['verified', 'refunded'] } }, since, 'amount'),
    countByDay(Payment, 'creditedAt', { status: { $in: ['verified', 'refunded'] } }, since),
    countByDay(User, 'createdAt', { role: 'user' }, since),
    countByDay(Biodata, 'submittedAt', {}, since),
    countByDay(Biodata, 'approvedAt', {}, since),
    countByDay(ConnectionTransaction, 'createdAt', { type: 'unlock' }, since),
    countByDay(ProfileVisit, 'createdAt', {}, since),
  ]);
  const series = dailySeries(days).map((day) => ({
    day,
    revenue: revenue.get(day) ?? 0,
    sales: sales.get(day) ?? 0,
    signups: signups.get(day) ?? 0,
    submissions: submissions.get(day) ?? 0,
    approvals: approvals.get(day) ?? 0,
    unlocks: unlocks.get(day) ?? 0,
    visits: visits.get(day) ?? 0,
  }));

  const group = (Model, match, field) => Model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  const live = { status: 'approved', deletedAt: null, isHidden: false, blocked: { $ne: true } };
  const [users, biodataStatus, byType, byReligion, byDistrict, byMethod, totals, connections, deleteReasons] = await Promise.all([
    group(User, {}, 'role'),
    group(Biodata, { deletedAt: null }, 'status'),
    group(Biodata, live, 'type'),
    group(Biodata, live, 'religion'),
    Biodata.aggregate([{ $match: live }, { $group: { _id: '$district', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]),
    Payment.aggregate([{ $match: { status: 'verified' } }, { $group: { _id: '$method', n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    Payment.aggregate([{ $match: { status: { $in: ['verified', 'refunded'] } } }, { $group: { _id: '$status', amount: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    ConnectionTransaction.aggregate([{ $group: { _id: '$type', n: { $sum: '$delta' } } }]),
    group(Biodata, { deletedAt: { $ne: null } }, 'deleteReason'),
  ]);
  const pick = (rows) => rows.map((r) => ({ key: r._id ?? 'unknown', count: r.n, ...(r.amount !== undefined ? { amount: r.amount } : {}) }));
  res.json({
    days,
    series,
    totals: {
      revenue: totals.find((t) => t._id === 'verified')?.amount ?? 0,
      refunded: totals.find((t) => t._id === 'refunded')?.amount ?? 0,
      sales: totals.reduce((s, t) => s + t.n, 0),
      connectionsSold: connections.find((c) => c._id === 'purchase')?.n ?? 0,
      connectionsUsed: -(connections.find((c) => c._id === 'unlock')?.n ?? 0),
    },
    breakdowns: {
      users: pick(users),
      biodataStatus: pick(biodataStatus),
      type: pick(byType),
      religion: pick(byReligion),
      district: pick(byDistrict),
      paymentMethod: pick(byMethod),
      deleteReasons: pick(deleteReasons),
    },
  });
});

router.get('/audit-logs', requirePermission('audit.view'), async (req, res) => {
  const filter = {};
  if (req.query.action) filter.action = new RegExp(`^${escapeRegex(String(req.query.action))}`);
  if (req.query.targetId) filter.targetId = String(req.query.targetId);
  const p = pageParams(req.query, { defaultLimit: 30 });
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).populate('actor', 'name email phone role status').lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json(paged(items.map((a) => ({ id: a._id, action: a.action, summary: a.summary ?? null, targetType: a.targetType ?? null, targetId: a.targetId ?? null, meta: a.meta ?? null, ip: a.ip ?? null, createdAt: a.createdAt, actor: userSummary(a.actor) })), total, p));
});

export default router;
