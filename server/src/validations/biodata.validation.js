import { z } from 'zod';
import { DELETE_REASONS, PHOTO_VISIBILITY, REPORT_REASONS, SECTION_KEYS, optionValues } from '@ghotok/shared';
import { ALLOWED_IMAGE_TYPES } from '../integrations/storage/index.js';

// Section contents are validated by the shared form schema (validateSection), not here.

export const sectionParams = z.object({ section: z.enum(SECTION_KEYS, { message: 'Unknown section' }) });

export const saveSection = z.object({ data: z.record(z.string(), z.unknown()).default({}) });

export const biodataNoParams = z.object({
  no: z
    .string()
    .trim()
    .regex(/^GH-\d{1,10}$/i, 'Invalid biodata number'),
});

export const visibility = z.object({ hidden: z.boolean() });

export const deleteBiodata = z.object({
  reason: z.enum(optionValues(DELETE_REASONS)),
  note: z.string().trim().max(500).optional(),
});

export const restoreRequest = z.object({ reason: z.string().trim().max(1000).optional() });

export const attachPhoto = z.object({
  ticket: z.string().min(10),
  visibility: z.enum(optionValues(PHOTO_VISIBILITY)).optional(),
});

export const photoVisibility = z.object({ visibility: z.enum(optionValues(PHOTO_VISIBILITY)) });

export const nidUploadUrl = z.object({
  side: z.enum(['front', 'back']),
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
});

export const submitNid = z.object({ frontTicket: z.string().min(10), backTicket: z.string().min(10) });

export const proposal = z.object({ message: z.string().trim().max(1000).optional() });

export const report = z.object({
  reason: z.enum(optionValues(REPORT_REASONS)),
  details: z.string().trim().max(2000).optional(),
});

const text = z.string().trim().max(200).optional();

/** Search filters. Unknown parameters are dropped; values are interpreted by search.service.js. */
export const searchQuery = z.object({
  type: text,
  religion: text,
  marital: text,
  complexion: text,
  profession: text,
  economic: text,
  division: text,
  district: z.string().trim().max(1000).optional(),
  ageMin: text,
  ageMax: text,
  heightMin: text,
  heightMax: text,
  education: text,
  nid: text,
  q: text,
  sort: text,
  page: text,
  limit: text,
});

export const featuredQuery = z.object({ limit: z.coerce.number().int().min(1).max(12).catch(4) });
