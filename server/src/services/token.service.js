import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Session } from '../models/index.js';
import { randomToken, sha256 } from '../utils/crypto.js';

// Authentication uses two tokens:
// - a short-lived JWT access token (stateless, checked on every request), and
// - an opaque refresh token stored hashed in `sessions`. Refresh tokens rotate on
//   every use; presenting an already-rotated token revokes its whole family,
//   which signs out a thief who copied an old token.

const ISSUER = 'ghotok';

export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
    issuer: ISSUER,
  });
}

/** @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError} */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISSUER });
}

/**
 * Creates a refresh-token session and returns the raw token (only its hash is stored).
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {{ userAgent?: string, ip?: string }} client
 */
export async function createSession(userId, client = {}, family = crypto.randomUUID()) {
  const token = randomToken();
  await Session.create({
    user: userId,
    tokenHash: sha256(token),
    family,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 864e5),
    userAgent: client.userAgent,
    ip: client.ip,
  });
  return token;
}

/**
 * Exchanges a refresh token for a new one.
 * @returns {Promise<{ userId: import('mongoose').Types.ObjectId, token: string } | null>}
 */
export async function rotateSession(rawToken, client = {}) {
  if (!rawToken) return null;
  const session = await Session.findOne({ tokenHash: sha256(rawToken) });
  if (!session) return null;
  if (session.revokedAt || session.replacedAt) {
    await Session.updateMany({ family: session.family, revokedAt: null }, { revokedAt: new Date() });
    return null;
  }
  if (session.expiresAt < new Date()) return null;
  // Claim the session atomically so two parallel refreshes cannot both succeed.
  const claimed = await Session.findOneAndUpdate(
    { _id: session._id, replacedAt: null, revokedAt: null },
    { replacedAt: new Date() },
  );
  if (!claimed) return null;
  const token = await createSession(session.user, client, session.family);
  return { userId: session.user, token };
}

export async function revokeSession(rawToken) {
  if (!rawToken) return;
  await Session.updateOne({ tokenHash: sha256(rawToken) }, { revokedAt: new Date() });
}

/** Signs a user out of every device. */
export async function revokeAllSessions(userId) {
  await Session.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
}

/** Issues a new access token and session for a user. */
export async function issueTokens(user, client) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: await createSession(user._id, client),
    expiresIn: env.ACCESS_TOKEN_TTL_MIN * 60,
  };
}
