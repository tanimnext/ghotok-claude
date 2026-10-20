import { Router } from 'express';
import { notFound } from '../lib/errors.js';
import { getSetting } from '../lib/settings.js';
import { Biodata, Faq, PUBLIC_FILTER, Page } from '../models/index.js';

const router = Router();

let statsCache = { at: 0, data: null };

router.get('/stats', async (_req, res) => {
  if (statsCache.data && Date.now() - statsCache.at < 60e3) return res.json(statsCache.data);
  const [byType, marriages, settings] = await Promise.all([
    Biodata.aggregate([{ $match: PUBLIC_FILTER }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    Biodata.countDocuments({ deleteReason: 'married_via_ghotok' }),
    getSetting('stats'),
  ]);
  const count = (t) => byType.find((x) => x._id === t)?.n ?? 0;
  const data = {
    show: settings.show !== false,
    biodatas: count('bride') + count('groom'),
    brides: count('bride'),
    grooms: count('groom'),
    marriages: marriages + Number(settings.marriagesOffset ?? 0),
  };
  statsCache = { at: Date.now(), data };
  res.json(data);
});

router.get('/settings', async (_req, res) => {
  const site = await getSetting('site');
  const payments = await getSetting('payments');
  res.json({ site, payments: { verificationHours: payments.verificationHours } });
});

router.get('/pages/:slug', async (req, res) => {
  const page = await Page.findOne({ slug: String(req.params.slug).toLowerCase(), isPublished: true }).lean();
  if (!page) throw notFound('Page');
  res.json({ page: { slug: page.slug, title: page.title, body: page.body, updatedAt: page.updatedAt } });
});

router.get('/faqs', async (_req, res) => {
  const faqs = await Faq.find({ isActive: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();
  res.json({ items: faqs.map((f) => ({ id: f._id, question: f.question, answer: f.answer, category: f.category })) });
});

export function resetStatsCache() {
  statsCache = { at: 0, data: null };
}

export default router;
