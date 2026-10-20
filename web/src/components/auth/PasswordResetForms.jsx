'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, FormMessage, TextInput } from '@ghotok/ui';
import { useSetAuthUser } from '@/hooks/use-auth';
import { useErrorMessage } from '@/hooks/use-error-message';
import { authApi } from '@/lib/api/endpoints';
import { validate } from '@/lib/validators';
import { useT } from '@/providers/PreferencesProvider';
import { AuthCard } from './AuthCard.jsx';
import { clearDevOtp, readDevOtp, rememberDevOtp } from './dev-otp.js';

function BackToLogin() {
  const { t } = useT();
  return (
    <Link href="/login" className="font-bold text-rose-text">
      {t('auth.backToLogin')}
    </Link>
  );
}

/** Step 1: ask for a reset code. */
export function ForgotPasswordForm() {
  const { t } = useT();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState(null);
  const send = useMutation({
    mutationFn: () => authApi.forgotPassword({ identifier }),
    onSuccess: (res) => {
      rememberDevOtp(res.devOtp);
      router.push(`/reset-password?identifier=${encodeURIComponent(identifier.trim())}`);
    },
  });
  const submit = (e) => {
    e.preventDefault();
    const found = validate({ identifier }, { identifier: 'identifier' });
    setError(found.identifier ?? null);
    if (!found.identifier) send.mutate();
  };
  return (
    <AuthCard title={t('auth.forgotTitle')} subtitle={t('auth.forgotSub')} footer={<BackToLogin />}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormMessage>{send.error && errorMessage(send.error)}</FormMessage>
        <TextInput
          label={t('auth.identifier')}
          placeholder={t('auth.identifierPh')}
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={error && t(error)}
        />
        <Button type="submit" size="lg" loading={send.isPending}>
          {t('auth.sendCode')}
        </Button>
      </form>
    </AuthCard>
  );
}

/** Step 2: the code and a new password. Signs the member in on success. */
export function ResetPasswordForm({ identifier }) {
  const { t } = useT();
  const router = useRouter();
  const setUser = useSetAuthUser();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState({ code: '', password: '' });
  const [errors, setErrors] = useState({});
  const [devOtp, setDevOtp] = useState(null);
  useEffect(() => setDevOtp(readDevOtp()), []);

  const reset = useMutation({
    mutationFn: () => authApi.resetPassword({ identifier, code: form.code.trim(), password: form.password }),
    onSuccess: (res) => {
      clearDevOtp();
      if (res.user) {
        setUser(res.user);
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    },
  });
  const submit = (e) => {
    e.preventDefault();
    const found = validate(form, { code: 'code', password: 'password' });
    setErrors(found);
    if (!Object.keys(found).length) reset.mutate();
  };
  return (
    <AuthCard
      title={t('auth.resetTitle')}
      subtitle={t('auth.verifySub', { to: identifier })}
      footer={<BackToLogin />}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {devOtp && <FormMessage tone="info">{t('auth.devCode', { code: devOtp })}</FormMessage>}
        <FormMessage>{reset.error && errorMessage(reset.error)}</FormMessage>
        <TextInput
          label={t('auth.code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.replace(/\D/g, '') }))}
          error={errors.code && t(errors.code)}
        />
        <TextInput
          label={t('auth.newPassword')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.passwordHint')}
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          error={errors.password && t(errors.password)}
        />
        <Button type="submit" size="lg" loading={reset.isPending}>
          {t('auth.reset')}
        </Button>
      </form>
    </AuthCard>
  );
}
