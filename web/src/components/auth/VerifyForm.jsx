'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, FormMessage, TextInput } from '@ghotok/ui';
import { useSetAuthUser } from '@/hooks/use-auth';
import { useErrorMessage } from '@/hooks/use-error-message';
import { authApi } from '@/lib/api/endpoints';
import { safeNext, validate } from '@/lib/validators';
import { useT } from '@/providers/PreferencesProvider';
import { useToast } from '@ghotok/ui';
import { AuthCard } from './AuthCard.jsx';
import { clearDevOtp, readDevOtp, rememberDevOtp } from './dev-otp.js';

const RESEND_SECONDS = 60;

export function VerifyForm({ identifier, next }) {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const setUser = useSetAuthUser();
  const errorMessage = useErrorMessage();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [devOtp, setDevOtp] = useState(null);
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => setDevOtp(readDevOtp()), []);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const verify = useMutation({
    mutationFn: () => authApi.verify({ identifier, code: code.trim() }),
    onSuccess: ({ user }) => {
      clearDevOtp();
      setUser(user);
      router.push(safeNext(next));
      router.refresh();
    },
  });

  const resend = useMutation({
    mutationFn: () => authApi.resendOtp({ identifier, purpose: 'verify' }),
    onSuccess: (res) => {
      rememberDevOtp(res.devOtp);
      setDevOtp(res.devOtp ?? null);
      setWait(RESEND_SECONDS);
      toast.success(t('auth.resent'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submit = (e) => {
    e.preventDefault();
    const found = validate({ code }, { code: 'code' });
    setError(found.code ?? null);
    if (!found.code) verify.mutate();
  };

  return (
    <AuthCard title={t('auth.verifyTitle')} subtitle={t('auth.verifySub', { to: identifier })}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {devOtp && <FormMessage tone="info">{t('auth.devCode', { code: devOtp })}</FormMessage>}
        <FormMessage>{verify.error && errorMessage(verify.error)}</FormMessage>
        <TextInput
          label={t('auth.code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          error={error && t(error)}
        />
        <Button type="submit" size="lg" loading={verify.isPending}>
          {t('auth.verify')}
        </Button>
        <Button
          variant="ghost"
          disabled={wait > 0}
          loading={resend.isPending}
          onClick={() => resend.mutate()}
        >
          {t('auth.resend')}
          {wait > 0 ? ` (${wait})` : ''}
        </Button>
      </form>
    </AuthCard>
  );
}
