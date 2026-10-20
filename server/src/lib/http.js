import { z } from 'zod';
import mongoose from 'mongoose';
import { badRequest, notFound } from './errors.js';

/** Parses `req.body` (or another source) with a zod schema, throwing a 400 with field errors on failure. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw badRequest('VALIDATION_ERROR', 'Please check the highlighted fields.', { fields });
  }
  return result.data;
}

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export function assertObjectId(id, what = 'Resource') {
  if (!mongoose.isValidObjectId(id)) throw notFound(what);
  return id;
}

/** Reads `page` and `limit` from a query object. */
export function pageParams(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function paged(items, total, { page, limit }) {
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Escapes a user string for use inside a RegExp. */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Comma separated query value → array of strings. */
export function csv(value) {
  if (value === undefined || value === null || value === '') return [];
  return (Array.isArray(value) ? value : String(value).split(',')).map((s) => String(s).trim()).filter(Boolean);
}
