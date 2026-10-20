'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, FormMessage, TextInput } from '@ghotok/ui';
import { useSetAuthUser } from '@/hooks/use-auth';
import { useErrorMessage } from '@/hooks/use-error-message';
import { authApi } from '@/lib/api/endpoints';
import { safeNext, validate } from '@/lib/validators';
import { useT } from '@/providers/PreferencesProvider';
import { AuthCard } from './AuthCard.jsx';
import { rememberDevOtp } from './dev-otp.js';

export function LoginForm({ next }) {
  const { t } = useT();
  const router = useRouter();
  const setUser = useSetAuthUser();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState({});

  const login = useMutation({
    mutationFn: () => authApi.login(form),
    onSuccess: ({ user }) => {
      setUser(user);
      router.push(safeNext(next));
      router.refresh();
    },
    onError: (err) => {
      if (err.code === 'NOT_VERIFIED') {
        rememberDevOtp(err.details?.devOtp);
        router.push(
          `/verify?identifier=${encodeURIComponent(err.details?.identifier ?? form.identifier)}&next=${encodeURIComponent(safeNext(next))}`,
        );
      }
    },
  });

  const submit = (e) => {
    e.preventDefault();
    const found = validate(form, { identifier: 'identifier', password: 'required' });
    setErrors(found);
    if (!Object.keys(found).length) login.mutate();
  };
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <AuthCard
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSub')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link href="/register" className="font-bold text-rose-text">
            {t('auth.register')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormMessage>
          {login.error && login.error.code !== 'NOT_VERIFIED' && errorMessage(login.error)}
        </FormMessage>
        <TextInput
          label={t('auth.identifier')}
          placeholder={t('auth.identifierPh')}
          autoComplete="username"
          value={form.identifier}
          onChange={set('identifier')}
          error={errors.identifier && t(errors.identifier)}
        />
        <TextInput
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password && t(errors.password)}
        />
        <Link href="/forgot-password" className="self-end text-sm font-bold text-rose-text">
          {t('auth.forgot')}
        </Link>
        <Button type="submit" size="lg" loading={login.isPending}>
          {t('auth.login')}
        </Button>
      </form>
    </AuthCard>
  );
}
