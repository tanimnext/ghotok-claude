import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env, isTest } from '../config/env.js';
import { Session } from '../models/index.js';

export const ACCESS_COOKIE = 'gh_at';
export const REFRESH_COOKIE = 'gh_rt';
const REFRESH_PATH = '/api/auth';

const BCRYPT_ROUNDS = isTest ? 4 : 12;

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);
export const verifyPassword = (password, hash) => (hash ? bcrypt.compare(password, hash) : false);

export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
    issuer: 'ghotok',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'ghotok' });
}

function clientInfo(req) {
  return { userAgent: String(req.get('user-agent') ?? '').slice(0, 300), ip: req.ip };
}

/** Creates a refresh-token session and returns the raw token. */
export async function createSession(user, req, family = crypto.randomUUID()) {
  const token = crypto.randomBytes(48).toString('base64url');
  await Session.create({
    user: user._id,
    tokenHash: sha256(token),
    family,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 864e5),
    ...clientInfo(req),
  });
  return token;
}

/**
 * Rotates a refresh token. Returns `{ userId, token }` for the new session, or null.
 * Presenting a token that was already rotated revokes every session in its family.
 */
export async function rotateSession(rawToken, req) {
  if (!rawToken) return null;
  const session = await Session.findOne({ tokenHash: sha256(rawToken) });
  if (!session) return null;
  if (session.revokedAt || session.replacedAt) {
    await Session.updateMany({ family: session.family, revokedAt: null }, { revokedAt: new Date() });
    return null;
  }
  if (session.expiresAt < new Date()) return null;
  const claimed = await Session.findOneAndUpdate(
    { _id: session._id, replacedAt: null, revokedAt: null },
    { replacedAt: new Date() },
  );
  if (!claimed) return null;
  const token = await createSession({ _id: session.user }, req, session.family);
  return { userId: session.user, token };
}

export async function revokeSession(rawToken) {
  if (!rawToken) return;
  await Session.updateOne({ tokenHash: sha256(rawToken) }, { revokedAt: new Date() });
}

export async function revokeAllSessions(userId) {
  await Session.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
}

function cookieBase() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setAuthCookies(res, { access, refresh }) {
  res.cookie(ACCESS_COOKIE, access, { ...cookieBase(), path: '/', maxAge: env.ACCESS_TOKEN_TTL_MIN * 60e3 });
  if (refresh) {
    res.cookie(REFRESH_COOKIE, refresh, { ...cookieBase(), path: REFRESH_PATH, maxAge: env.REFRESH_TOKEN_TTL_DAYS * 864e5 });
  }
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: REFRESH_PATH });
}

/** Issues an access token + new session and sets both cookies. Returns the tokens for API clients. */
export async function signIn(res, req, user) {
  const access = signAccessToken(user);
  const refresh = await createSession(user, req);
  setAuthCookies(res, { access, refresh });
  return { accessToken: access, refreshToken: refresh, expiresIn: env.ACCESS_TOKEN_TTL_MIN * 60 };
}
