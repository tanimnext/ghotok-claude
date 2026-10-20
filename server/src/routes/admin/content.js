import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { assertObjectId, parse } from '../../lib/http.js';
import { DEFAULT_SETTINGS, getAllSettings, setSetting } from '../../lib/settings.js';
import { requirePermission } from '../../middleware/auth.js';
import { Faq, Page } from '../../models/index.js';
import { resetStatsCache } from '../public.js';

const router = Router();

router.get('/settings', requirePermission('settings.manage'), async (_req, res) => {
  res.json({ settings: await getAllSettings() });
});

router.put('/settings/:key', requirePermission('settings.manage'), async (req, res) => {
  const { key } = req.params;
  if (!(key in DEFAULT_SETTINGS)) throw notFound('Setting');
  const value = req.body?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest('VALIDATION_ERROR', 'Setting value must be an object.');
  if (JSON.stringify(value).length > 20000) throw badRequest('TOO_LARGE', 'Setting value is too large.');
  const saved = await setSetting(key, value, req.user._id);
  if (key === 'stats') resetStatsCache();
  await audit(req, 'settings.update', { targetType: 'setting', targetId: key, summary: `Updated ${key} settings` });
  res.json({ key, value: saved });
});

const i18n = (max) => z.object({ en: z.string().max(max).default(''), bn: z.string().max(max).default('') });

router.get('/pages', requirePermission('content.manage'), async (_req, res) => {
  const items = await Page.find().sort({ slug: 1 }).lean();
  res.json({ items });
});

router.get('/pages/:slug', requirePermission('content.manage'), async (req, res) => {
  const page = await Page.findOne({ slug: req.params.slug }).lean();
  if (!page) throw notFound('Page');
  res.json({ page });
});

router.put('/pages/:slug', requirePermission('content.manage'), async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) throw badRequest('VALIDATION_ERROR', 'Use lowercase letters, numbers and dashes for the address.');
  const body = parse(z.object({ title: i18n(160), body: i18n(60000), isPublished: z.boolean().default(true) }), req.body);
  const page = await Page.findOneAndUpdate({ slug }, { ...body, slug, updatedBy: req.user._id }, { upsert: true, new: true });
  await audit(req, 'page.update', { targetType: 'page', targetId: slug, summary: `Updated page ${slug}` });
  res.json({ page });
});

router.delete('/pages/:slug', requirePermission('content.manage'), async (req, res) => {
  const page = await Page.findOneAndDelete({ slug: req.params.slug });
  if (!page) throw notFound('Page');
  await audit(req, 'page.delete', { targetType: 'page', targetId: page.slug, summary: `Deleted page ${page.slug}` });
  res.json({ ok: true });
});

// No defaults here: zod applies defaults inside .partial(), which would reset fields on PATCH.
const faqBody = z.object({
  question: i18n(300),
  answer: i18n(5000),
  category: z.string().trim().max(40),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

router.get('/faqs', requirePermission('content.manage'), async (_req, res) => {
  res.json({ items: await Faq.find().sort({ sortOrder: 1, createdAt: 1 }).lean() });
});

router.post('/faqs', requirePermission('content.manage'), async (req, res) => {
  const faq = await Faq.create({ category: 'general', sortOrder: 0, isActive: true, ...parse(faqBody.partial({ category: true, sortOrder: true, isActive: true }), req.body) });
  await audit(req, 'faq.create', { targetType: 'faq', targetId: faq._id, summary: 'Created FAQ' });
  res.status(201).json({ faq });
});

router.patch('/faqs/:id', requirePermission('content.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'FAQ');
  const faq = await Faq.findByIdAndUpdate(req.params.id, parse(faqBody.partial(), req.body), { new: true });
  if (!faq) throw notFound('FAQ');
  res.json({ faq });
});

router.delete('/faqs/:id', requirePermission('content.manage'), async (req, res) => {
  assertObjectId(req.params.id, 'FAQ');
  const faq = await Faq.findByIdAndDelete(req.params.id);
  if (!faq) throw notFound('FAQ');
  await audit(req, 'faq.delete', { targetType: 'faq', targetId: faq._id, summary: 'Deleted FAQ' });
  res.json({ ok: true });
});

export default router;
