import express, { Router } from 'express';
import * as upload from '../controllers/upload.controller.js';
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from '../integrations/storage/index.js';

// Signed upload/download URLs of the local storage driver: /api/uploads
const router = Router();

router.put(
  '/local/:token',
  express.raw({ type: ALLOWED_IMAGE_TYPES, limit: MAX_UPLOAD_BYTES }),
  upload.upload,
);
router.get('/file/:token', upload.download);

export default router;
