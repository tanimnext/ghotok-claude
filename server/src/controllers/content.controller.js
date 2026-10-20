import * as contentService from '../services/content.service.js';

export async function stats(_req, res) {
  res.json(await contentService.publicStats());
}

export async function settings(_req, res) {
  res.json(await contentService.publicSettings());
}

export async function page(req, res) {
  res.json({ page: await contentService.publishedPage(req.params.slug) });
}

export async function faqs(_req, res) {
  res.json({ items: await contentService.activeFaqs() });
}
