// In development the API can return OTP codes (OTP_DEV_ECHO=true) so the flow can
// be tested without email/SMS. The code is passed to the next page in sessionStorage.
const KEY = 'gh_dev_otp';

export function rememberDevOtp(code) {
  if (code) sessionStorage.setItem(KEY, code);
}

export function readDevOtp() {
  return typeof window === 'undefined' ? null : sessionStorage.getItem(KEY);
}

export function clearDevOtp() {
  sessionStorage.removeItem(KEY);
}
