import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate } from 'react-router';
import { isStaff } from '@ghotok/shared';
import { Button, FormMessage, TextInput } from '@ghotok/ui';
import { AUTH_KEY, useAuth } from '../hooks/useAuth.js';
import { useErrorMessage } from '../hooks/useErrorMessage.js';
import { authApi } from '../lib/api.js';
import { useT } from '../providers/PreferencesProvider.jsx';

export function LoginPage() {
  const { t } = useT();
  const { user, isStaff: staff } = useAuth();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [notStaff, setNotStaff] = useState(false);

  const login = useMutation({
    mutationFn: () => authApi.login(form),
    onSuccess: async ({ user: signedIn }) => {
      if (!isStaff(signedIn.role)) {
        setNotStaff(true);
        await authApi.logout();
        return;
      }
      queryClient.setQueryData(AUTH_KEY, signedIn);
    },
  });

  if (user && staff) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-panel p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setNotStaff(false);
          login.mutate();
        }}
        className="flex w-full max-w-[420px] flex-col gap-5 rounded-[32px] bg-surface p-8 shadow-card"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <svg width="52" height="41" viewBox="0 0 38 30" fill="none" aria-hidden="true">
            <circle cx="13" cy="15" r="10" stroke="var(--gold)" strokeWidth="2.4" />
            <circle cx="25" cy="15" r="10" stroke="var(--rose)" strokeWidth="2.4" />
          </svg>
          <h1 className="font-display text-3xl font-medium">{t('login.title')}</h1>
          <p className="text-[15px] text-muted">{t('login.sub')}</p>
        </div>
        <FormMessage>{notStaff ? t('login.notStaff') : login.error && errorMessage(login.error)}</FormMessage>
        <TextInput
          label={t('login.identifier')}
          autoComplete="username"
          required
          value={form.identifier}
          onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
        />
        <TextInput
          label={t('login.password')}
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        />
        <Button type="submit" size="lg" loading={login.isPending}>
          {t('login.submit')}
        </Button>
      </form>
    </div>
  );
}
