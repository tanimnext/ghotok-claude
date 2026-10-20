// Browser API client. Every request goes to /api on this origin; Next.js forwards
// it to the Express API (see next.config.mjs), so the auth cookies are first-party.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field errors from a 400 VALIDATION_ERROR, e.g. `{ trxId: 'invalid' }`. */
  get fields() {
    return this.details?.fields ?? {};
  }
}

// Endpoints that must never trigger a token refresh (they are the auth flow itself).
const NO_REFRESH = [
  '/auth/login',
  '/auth/register',
  '/auth/verify',
  '/auth/refresh',
  '/auth/logout',
  '/auth/resend-otp',
  '/auth/forgot-password',
  '/auth/reset-password',
];

export const SESSION_HINT_COOKIE = 'gh_session';

/** True when the API has told this browser that a session exists (see server utils/auth-cookies.js). */
export function hasSessionHint() {
  return document.cookie.split('; ').includes(`${SESSION_HINT_COOKIE}=1`);
}

function clearSessionHint() {
  document.cookie = `${SESSION_HINT_COOKIE}=; path=/; max-age=0`;
}

let refreshing = null;

/** Refreshes the session once, even when many requests fail at the same time. */
function refreshSession() {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((res) => {
      if (!res.ok) clearSessionHint();
      return res.ok;
    })
    .catch(() => false)
    .finally(() => {
      setTimeout(() => {
        refreshing = null;
      }, 0);
    });
  return refreshing;
}

function toQueryString(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Calls the API and returns the parsed JSON.
 * An expired session is refreshed once and the request retried.
 * @throws {ApiError}
 */
export async function apiFetch(path, { method = 'GET', body, query, retry = true } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}${toQueryString(query)}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server.');
  }
  if (res.status === 401 && retry && !NO_REFRESH.includes(path) && (await refreshSession())) {
    return apiFetch(path, { method, body, query, retry: false });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const error = data?.error ?? {};
    throw new ApiError(
      res.status,
      error.code ?? 'SERVER_ERROR',
      error.message ?? res.statusText,
      error.details,
    );
  }
  return data;
}

export const api = {
  get: (path, query) => apiFetch(path, { query }),
  post: (path, body = {}) => apiFetch(path, { method: 'POST', body }),
  put: (path, body = {}) => apiFetch(path, { method: 'PUT', body }),
  patch: (path, body = {}) => apiFetch(path, { method: 'PATCH', body }),
  delete: (path, body) => apiFetch(path, { method: 'DELETE', body }),
};

/**
 * Uploads a file to the URL the API issued. Handles the three storage targets:
 * Cloudflare Images (POST, multipart form), and the local development driver or
 * R2 (PUT, raw body).
 * @param {{ uploadURL: string, method: 'POST' | 'PUT', field?: string, headers?: object }} target
 */
export async function uploadFile(target, file) {
  let init;
  if (target.method === 'POST') {
    const form = new FormData();
    form.append(target.field ?? 'file', file);
    init = { method: 'POST', body: form };
  } else {
    init = { method: 'PUT', body: file, headers: { 'Content-Type': file.type, ...(target.headers ?? {}) } };
  }
  const res = await fetch(target.uploadURL, init).catch(() => null);
  if (!res?.ok) throw new ApiError(res?.status ?? 0, 'UPLOAD_FAILED', 'The upload failed. Please try again.');
}
