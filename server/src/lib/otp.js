import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { Otp } from '../models/index.js';
import { ApiError, badRequest } from './errors.js';
import { deliver } from './messaging.js';

const TTL_MIN = 10;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const hashCode = (identifier, code) =>
  crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${identifier}:${code}`).digest('hex');

const TEXT = {
  verify: (code) => `Ghotok: your verification code is ${code}. It expires in ${TTL_MIN} minutes. / ঘটক যাচাই কোড: ${code}`,
  reset: (code) => `Ghotok: your password reset code is ${code}. It expires in ${TTL_MIN} minutes. / ঘটক পাসওয়ার্ড রিসেট কোড: ${code}`,
};

/** Creates and sends a 6-digit code. Returns the code only when OTP_DEV_ECHO is on. */
export async function issueOtp(identifier, purpose) {
  const recent = await Otp.findOne({ identifier, purpose, consumedAt: null }).sort({ createdAt: -1 });
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_SECONDS * 1000) {
    throw new ApiError(429, 'OTP_TOO_SOON', `Please wait ${RESEND_SECONDS} seconds before requesting another code.`);
  }
  await Otp.updateMany({ identifier, purpose, consumedAt: null }, { consumedAt: new Date() });
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await Otp.create({ identifier, purpose, codeHash: hashCode(identifier, code), expiresAt: new Date(Date.now() + TTL_MIN * 60e3) });
  await deliver(identifier, { subject: purpose === 'reset' ? 'Reset your Ghotok password' : 'Verify your Ghotok account', text: TEXT[purpose](code) });
  return env.OTP_DEV_ECHO ? code : undefined;
}

/** Consumes a valid code or throws 400. */
export async function consumeOtp(identifier, purpose, code) {
  const otp = await Otp.findOne({ identifier, purpose, consumedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) throw badRequest('OTP_INVALID', 'The code is invalid or has expired.');
  const expected = Buffer.from(otp.codeHash, 'hex');
  const given = Buffer.from(hashCode(identifier, String(code ?? '').trim()), 'hex');
  if (!crypto.timingSafeEqual(expected, given)) {
    await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    throw badRequest('OTP_INVALID', 'The code is invalid or has expired.');
  }
  await Otp.updateOne({ _id: otp._id }, { consumedAt: new Date() });
}
