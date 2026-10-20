import { z } from 'zod';
import { identifier, optionalEmail, optionalPhone, password } from './common.validation.js';

export const register = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(80),
  email: optionalEmail,
  phone: optionalPhone,
  password,
  language: z.enum(['en', 'bn']).default('en'),
});

export const login = z.object({ identifier, password: z.string().min(1).max(128) });

export const verify = z.object({ identifier, code: z.string().trim().length(6, 'Enter the 6-digit code.') });

export const resendOtp = z.object({ identifier, purpose: z.enum(['verify', 'reset']).default('verify') });

export const forgotPassword = z.object({ identifier });

export const resetPassword = z.object({ identifier, code: z.string().trim().length(6), password });
