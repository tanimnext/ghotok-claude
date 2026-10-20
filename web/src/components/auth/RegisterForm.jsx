'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, FormMessage, TextInput } from '@ghotok/ui';
import { useSetAuthUser } from '@/hooks/use-auth';
import { useErrorMessage } from '@/hooks/use-error-message';
import { authApi } from '@/lib/api/endpoints';
import { validate } from '@/lib/validators';
import { useT } from '@/providers/PreferencesProvider';
import { AuthCard } from './AuthCard.jsx';
import { GoogleSignIn } from './GoogleSignIn.jsx';
import { rememberDevOtp } from './dev-otp.js';

export function RegisterForm({ googleEnabled = false }) {
  const { t, lang } = useT();
  const router = useRouter();
  const setUser = useSetAuthUser();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState({});

  const register = useMutation({
    mutationFn: () => authApi.register({ ...form, language: lang }),
    onSuccess: (result) => {
      if (result.needsVerification) {
        rememberDevOtp(result.devOtp);
        router.push(`/verify?identifier=${encodeURIComponent(result.identifier)}&next=/dashboard/biodata`);
      } else {
        setUser(result.user);
        router.push('/dashboard/biodata');
      }
    },
  });

  const submit = (e) => {
    e.preventDefault();
    const found = validate(form, {
      name: 'name',
      email: 'optionalEmail',
      phone: 'optionalPhone',
      password: 'password',
    });
    if (!form.email && !form.phone) found.email = 'validation.emailOrPhone';
    setErrors(found);
    if (!Object.keys(found).length) register.mutate();
  };
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const err = (key) => errors[key] && t(errors[key]);

  return (
    <AuthCard
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSub')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link href="/login" className="font-bold text-rose-text">
            {t('auth.login')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormMessage>{register.error && errorMessage(register.error)}</FormMessage>
        <TextInput
          label={t('auth.name')}
          autoComplete="name"
          value={form.name}
          onChange={set('name')}
          error={err('name')}
          required
        />
        <TextInput
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          error={err('email')}
        />
        <TextInput
          label={t('auth.phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="01XXXXXXXXX"
          hint={t('auth.emailOrPhone')}
          value={form.phone}
          onChange={set('phone')}
          error={err('phone')}
        />
        <TextInput
          label={t('auth.password')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.passwordHint')}
          value={form.password}
          onChange={set('password')}
          error={err('password')}
          required
        />
        <p className="text-[13px] leading-relaxed text-muted">
          {t('auth.agree')}{' '}
          <Link href="/terms" className="font-semibold underline">
            {t('auth.terms')}
          </Link>{' '}
          {t('auth.and')}{' '}
          <Link href="/privacy-policy" className="font-semibold underline">
            {t('auth.privacy')}
          </Link>
          .
        </p>
        <Button type="submit" size="lg" loading={register.isPending}>
          {t('auth.register')}
        </Button>
      </form>
      {googleEnabled && <GoogleSignIn />}
    </AuthCard>
  );
}
