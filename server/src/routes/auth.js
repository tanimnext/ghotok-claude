import { Router } from 'express';
import { z } from 'zod';
import { isStaff, isValidEmail, isValidPhone, normalizePhone } from '@ghotok/shared';
import { env } from '../config/env.js';
import {
  REFRESH_COOKIE, clearAuthCookies, hashPassword, revokeAllSessions, revokeSession, rotateSession, setAuthCookies,
  signAccessToken, signIn, verifyPassword,
} from '../lib/auth.js';
import { ApiError, badRequest, conflict } from '../lib/errors.js';
import { parse } from '../lib/http.js';
import { consumeOtp, issueOtp } from '../lib/otp.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, otpLimiter } from '../middleware/security.js';
import { User } from '../models/index.js';

const router = Router();

const password = z.string().min(8, 'Use at least 8 characters.').max(128);

/** Accepts an email address or a Bangladeshi mobile number. */
function identify(raw) {
  const s = String(raw ?? '').trim();
  if (s.includes('@')) {
    const email = s.toLowerCase();
    if (!isValidEmail(email)) throw badRequest('VALIDATION_ERROR', 'Enter a valid email or mobile number.', { fields: { identifier: 'invalid' } });
    return { field: 'email', value: email };
  }
  const phone = normalizePhone(s);
  if (!isValidPhone(phone)) throw badRequest('VALIDATION_ERROR', 'Enter a valid email or mobile number.', { fields: { identifier: 'invalid' } });
  return { field: 'phone', value: phone };
}

const findByIdentifier = (id, withPassword = false) => {
  const q = User.findOne({ [id.field]: id.value });
  return withPassword ? q.select('+passwordHash') : q;
};

/** Sends a verification code, swallowing "too soon" so login can always answer NOT_VERIFIED. */
async function sendVerification(identifier) {
  try {
    return await issueOtp(identifier, 'verify');
  } catch (err) {
    if (err.code === 'OTP_TOO_SOON') return undefined;
    throw err;
  }
}

router.post('/register', authLimiter, async (req, res) => {
  const body = parse(z.object({
    name: z.string().trim().min(2, 'Please enter your name.').max(80),
    email: z.string().trim().max(120).optional().or(z.literal('')),
    phone: z.string().trim().max(20).optional().or(z.literal('')),
    password,
    language: z.enum(['en', 'bn']).optional(),
  }), req.body);

  const email = body.email ? body.email.toLowerCase() : undefined;
  const phone = body.phone ? normalizePhone(body.phone) : undefined;
  if (!email && !phone) throw badRequest('VALIDATION_ERROR', 'Enter an email or a mobile number.', { fields: { email: 'required' } });
  if (email && !isValidEmail(email)) throw badRequest('VALIDATION_ERROR', 'Enter a valid email address.', { fields: { email: 'invalid' } });
  if (phone && !isValidPhone(phone)) throw badRequest('VALIDATION_ERROR', 'Enter a valid mobile number.', { fields: { phone: 'invalid' } });

  const or = [email && { email }, phone && { phone }].filter(Boolean);
  if (await User.exists({ $or: or })) throw conflict('ACCOUNT_EXISTS', 'An account with this email or mobile number already exists.');

  const user = await User.create({
    name: body.name, email, phone, passwordHash: await hashPassword(body.password), language: body.language ?? 'en',
  });

  if (env.REQUIRE_VERIFICATION) {
    const identifier = email ?? phone;
    const devOtp = await sendVerification(identifier);
    return res.status(201).json({ needsVerification: true, identifier, ...(devOtp ? { devOtp } : {}) });
  }
  const tokens = await signIn(res, req, user);
  res.status(201).json({ user: user.toSafeJSON(), ...tokens });
});

router.post('/login', authLimiter, async (req, res) => {
  const body = parse(z.object({ identifier: z.string().min(3).max(120), password: z.string().min(1).max(128) }), req.body);
  const id = identify(body.identifier);
  const user = await findByIdentifier(id, true);
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email/mobile number or password is incorrect.');
  }
  if (user.status === 'suspended' || user.status === 'banned') {
    throw new ApiError(403, 'ACCOUNT_INACTIVE', `Your account is ${user.status}. Please contact support.`);
  }
  if (env.REQUIRE_VERIFICATION && !user.isVerified && !isStaff(user.role)) {
    const devOtp = await sendVerification(id.value);
    throw new ApiError(403, 'NOT_VERIFIED', 'Please verify your account. We have sent you a code.', { identifier: id.value, ...(devOtp ? { devOtp } : {}) });
  }
  if (user.status === 'deactivated') {
    user.status = 'active';
    user.deactivatedAt = undefined;
  }
  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await signIn(res, req, user);
  res.json({ user: user.toSafeJSON(), ...tokens });
});

router.post('/verify', otpLimiter, async (req, res) => {
  const body = parse(z.object({ identifier: z.string().min(3).max(120), code: z.string().trim().length(6) }), req.body);
  const id = identify(body.identifier);
  const user = await findByIdentifier(id);
  if (!user) throw badRequest('OTP_INVALID', 'The code is invalid or has expired.');
  await consumeOtp(id.value, 'verify', body.code);
  if (id.field === 'email') user.emailVerified = true;
  else user.phoneVerified = true;
  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await signIn(res, req, user);
  res.json({ user: user.toSafeJSON(), ...tokens });
});

router.post('/resend-otp', otpLimiter, async (req, res) => {
  const body = parse(z.object({ identifier: z.string().min(3).max(120), purpose: z.enum(['verify', 'reset']).default('verify') }), req.body);
  const id = identify(body.identifier);
  const user = await findByIdentifier(id);
  let devOtp;
  if (user && !(body.purpose === 'verify' && (id.field === 'email' ? user.emailVerified : user.phoneVerified))) {
    devOtp = await issueOtp(id.value, body.purpose);
  }
  res.json({ ok: true, ...(devOtp ? { devOtp } : {}) });
});

router.post('/forgot-password', otpLimiter, async (req, res) => {
  const body = parse(z.object({ identifier: z.string().min(3).max(120) }), req.body);
  const id = identify(body.identifier);
  const user = await findByIdentifier(id);
  // Same answer whether or not the account exists, to avoid revealing who is registered.
  const devOtp = user ? await issueOtp(id.value, 'reset').catch((err) => { if (err.code !== 'OTP_TOO_SOON') throw err; }) : undefined;
  res.json({ ok: true, ...(devOtp ? { devOtp } : {}) });
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const body = parse(z.object({ identifier: z.string().min(3).max(120), code: z.string().trim().length(6), password }), req.body);
  const id = identify(body.identifier);
  const user = await findByIdentifier(id);
  if (!user) throw badRequest('OTP_INVALID', 'The code is invalid or has expired.');
  await consumeOtp(id.value, 'reset', body.code);
  user.passwordHash = await hashPassword(body.password);
  // Receiving the code proves ownership of this identifier.
  if (id.field === 'email') user.emailVerified = true;
  else user.phoneVerified = true;
  await user.save();
  await revokeAllSessions(user._id);
  if (user.status === 'suspended' || user.status === 'banned') return res.json({ ok: true });
  const tokens = await signIn(res, req, user);
  res.json({ ok: true, user: user.toSafeJSON(), ...tokens });
});

router.post('/refresh', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
  const rotated = await rotateSession(raw, req);
  const user = rotated && (await User.findById(rotated.userId));
  if (!user || user.status === 'suspended' || user.status === 'banned') {
    clearAuthCookies(res);
    throw new ApiError(401, 'SESSION_EXPIRED', 'Please log in again.');
  }
  const access = signAccessToken(user);
  setAuthCookies(res, { access, refresh: rotated.token });
  res.json({ user: user.toSafeJSON(), accessToken: access, refreshToken: rotated.token, expiresIn: env.ACCESS_TOKEN_TTL_MIN * 60 });
});

router.post('/logout', async (req, res) => {
  await revokeSession(req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken);
  clearAuthCookies(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

export default router;
