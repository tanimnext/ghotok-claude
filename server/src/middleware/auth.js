import { can, isStaff } from '@ghotok/shared';
import { ACCESS_COOKIE, verifyAccessToken } from '../lib/auth.js';
import { ApiError, forbidden, unauthorized } from '../lib/errors.js';
import { User } from '../models/index.js';

function readToken(req) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[ACCESS_COOKIE];
}

/**
 * Loads `req.user` when a valid access token is present. Never rejects by itself;
 * an expired token is remembered so `requireAuth` can answer TOKEN_EXPIRED.
 */
export async function loadUser(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user) req.user = user;
  } catch (err) {
    req.authError = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) {
    if (req.authError === 'TOKEN_EXPIRED') return next(new ApiError(401, 'TOKEN_EXPIRED', 'Your session has expired.'));
    return next(unauthorized());
  }
  if (req.user.status !== 'active') {
    return next(new ApiError(403, 'ACCOUNT_INACTIVE', `Your account is ${req.user.status}. Please contact support.`));
  }
  next();
}

/** Requires a verified email or phone (when verification is enabled). */
export function requireVerified(req, _res, next) {
  if (!req.user?.isVerified && !isStaff(req.user?.role)) {
    return next(new ApiError(403, 'NOT_VERIFIED', 'Please verify your email or phone number first.'));
  }
  next();
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.user) return requireAuth(req, _res, next);
    if (!can(req.user.role, permission)) return next(forbidden());
    next();
  };
}
