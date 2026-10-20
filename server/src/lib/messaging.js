import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let transport;
function mailer() {
  if (!env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transport;
}

export async function sendEmail({ to, subject, text, html }) {
  const t = mailer();
  if (!t) {
    logger.info({ to, subject, text }, 'Email (SMTP not configured, logged instead)');
    return;
  }
  await t.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
}

export async function sendSms({ to, message }) {
  if (!env.SMS_API_URL) {
    logger.info({ to, message }, 'SMS (gateway not configured, logged instead)');
    return;
  }
  const url = env.SMS_API_URL
    .replace('{number}', encodeURIComponent(`88${to}`))
    .replace('{message}', encodeURIComponent(message));
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`SMS gateway responded ${res.status}`);
}

/** Sends a message to an email address or a Bangladeshi phone number, whichever `to` is. */
export async function deliver(to, { subject, text }) {
  try {
    if (to.includes('@')) await sendEmail({ to, subject, text });
    else await sendSms({ to, message: text });
  } catch (err) {
    logger.error({ err, to }, 'Message delivery failed');
  }
}
