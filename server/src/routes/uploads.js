import fs from 'node:fs';
import express, { Router } from 'express';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, verifyUploadToken } from '../lib/storage/index.js';
import { EXT_BY_TYPE, findObject, writeObject } from '../lib/storage/local.js';

// Endpoints for the local (development) storage driver. With STORAGE_DRIVER=cloudflare,
// browsers upload straight to Cloudflare Images / R2 and these routes are unused.
const router = Router();

const MAGIC = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
};

router.put(
  '/local/:token',
  express.raw({ type: ALLOWED_IMAGE_TYPES, limit: MAX_UPLOAD_BYTES }),
  async (req, res) => {
    const t = verifyUploadToken(req.params.token, 'put');
    if (!t) throw forbidden('BAD_UPLOAD_TOKEN', 'The upload link has expired.');
    const type = String(req.get('content-type') ?? '').split(';')[0].trim();
    if (!ALLOWED_IMAGE_TYPES.includes(type)) throw badRequest('BAD_TYPE', 'Please upload a JPG, PNG or WEBP image.');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('EMPTY', 'The file is empty.');
    if (!MAGIC[type](req.body)) throw badRequest('BAD_TYPE', 'The file does not look like an image.');
    await writeObject(`${t.key}.${EXT_BY_TYPE[type]}`, req.body);
    res.json({ ok: true });
  },
);

router.get('/file/:token', async (req, res) => {
  const t = verifyUploadToken(req.params.token, 'get');
  if (!t) throw forbidden('BAD_FILE_TOKEN', 'This link has expired.');
  const found = await findObject(t.key);
  if (!found) throw notFound('File');
  const type = Object.entries(EXT_BY_TYPE).find(([, ext]) => ext === found.ext)?.[0] ?? 'application/octet-stream';
  res.set({ 'Content-Type': type, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(found.full).pipe(res);
});

export default router;
