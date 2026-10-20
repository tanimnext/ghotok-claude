import { env } from '../config/env.js';

// Browsers receive the tokens as httpOnly cookies (never readable by JavaScript).
// API clients without cookies (e.g. a future mobile app) use the tokens from the
// JSON response with an `Authorization: Bearer` header instead.

export const ACCESS_COOKIE = 'gh_at';
export const REFRESH_COOKIE = 'gh_rt';
const REFRESH_PATH = '/api/auth';

function baseOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(),
    path: '/',
    maxAge: env.ACCESS_TOKEN_TTL_MIN * 60e3,
  });
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...baseOptions(),
      path: REFRESH_PATH,
      maxAge: env.REFRESH_TOKEN_TTL_DAYS * 864e5,
    });
  }
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(), path: REFRESH_PATH });
}

/** The access token from the Authorization header or the cookie. */
export function readAccessToken(req) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[ACCESS_COOKIE];
}

/** The refresh token from the cookie or, for API clients, the JSON body. */
export function readRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
}
