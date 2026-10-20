import * as authService from '../services/auth.service.js';
import { issueTokens } from '../services/token.service.js';
import { toUserDTO } from '../serializers/user.serializer.js';
import { clearAuthCookies, readRefreshToken, setAuthCookies } from '../utils/auth-cookies.js';
import { requestContext } from '../utils/request.js';

/** Signs a user in: sets the cookies and returns the user plus tokens (for non-browser clients). */
async function signIn(req, res, user, status = 200) {
  const tokens = await issueTokens(user, requestContext(req));
  setAuthCookies(res, tokens);
  res.status(status).json({ user: toUserDTO(user), ...tokens });
}

export async function register(req, res) {
  const result = await authService.register(req.body);
  if (!result.needsVerification) return signIn(req, res, result.user, 201);
  res.status(201).json({
    needsVerification: true,
    identifier: result.identifier,
    ...(result.devOtp ? { devOtp: result.devOtp } : {}),
  });
}

export async function login(req, res) {
  await signIn(req, res, await authService.login(req.body));
}

export async function verify(req, res) {
  await signIn(req, res, await authService.verify(req.body));
}

export async function resendOtp(req, res) {
  const { devOtp } = await authService.resendOtp(req.body);
  res.json({ ok: true, ...(devOtp ? { devOtp } : {}) });
}

export async function forgotPassword(req, res) {
  const { devOtp } = await authService.forgotPassword(req.body);
  res.json({ ok: true, ...(devOtp ? { devOtp } : {}) });
}

export async function resetPassword(req, res) {
  const user = await authService.resetPassword(req.body);
  if (!user) return res.json({ ok: true });
  const tokens = await issueTokens(user, requestContext(req));
  setAuthCookies(res, tokens);
  res.json({ ok: true, user: toUserDTO(user), ...tokens });
}

export async function refresh(req, res) {
  try {
    const { user, tokens } = await authService.refresh(readRefreshToken(req), requestContext(req));
    setAuthCookies(res, tokens);
    res.json({ user: toUserDTO(user), ...tokens });
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
}

export async function logout(req, res) {
  await authService.logout(readRefreshToken(req));
  clearAuthCookies(res);
  res.json({ ok: true });
}

export function me(req, res) {
  res.json({ user: toUserDTO(req.user) });
}
