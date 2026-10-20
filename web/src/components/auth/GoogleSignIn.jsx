'use client';

import { safeNext } from '@/lib/validators';
import { useT } from '@/providers/PreferencesProvider';

/**
 * "Continue with Google": a full-page visit to the API, which sends the member
 * to Google and back (see server controllers/auth.controller.js). New members
 * get an account with their verified Google email.
 */
export function GoogleSignIn({ next, remember = true }) {
  const { t } = useT();
  const href = `/api/auth/google/start?next=${encodeURIComponent(safeNext(next))}&remember=${remember ? 1 : 0}`;
  return (
    <>
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-line" />
        {t('common.or')}
        <span className="h-px flex-1 bg-line" />
      </div>
      <a
        href={href}
        className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full border-[1.5px] border-line bg-surface px-8 text-base font-bold hover:border-gold"
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
          <path
            fill="#EA4335"
            d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"
          />
          <path
            fill="#FBBC05"
            d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
          />
        </svg>
        {t('auth.google')}
      </a>
    </>
  );
}
