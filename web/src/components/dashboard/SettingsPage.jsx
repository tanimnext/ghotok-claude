'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DELETE_REASONS, RESTORE_STATUS, optionLabel } from '@ghotok/shared';
import { Button, Card, FormMessage, Modal, SelectInput, TextArea, TextInput } from '@/components/ui';
import { AUTH_KEY, useAuth } from '@/hooks/use-auth';
import { useErrorMessage } from '@/hooks/use-error-message';
import { accountApi, biodataApi } from '@/lib/api/endpoints';
import { validate } from '@/lib/validators';
import { usePreferences } from '@/providers/PreferencesProvider';
import { useToast } from '@/providers/ToastProvider';
import { PageTitle } from './DashboardShell.jsx';
import { MY_BIODATA_KEY } from './biodata-editor/keys.js';

function ProfileCard({ user }) {
  const { t, lang, setLang } = usePreferences();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [language, setLanguage] = useState(user.language ?? lang);
  const save = useMutation({
    mutationFn: () => accountApi.updateProfile({ name, language }),
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(AUTH_KEY, updated);
      if (updated.language !== lang) setLang(updated.language);
      toast.success(t('common.saved'));
    },
  });
  return (
    <Card title={t('settings.profile')}>
      <FormMessage>{save.error && errorMessage(save.error)}</FormMessage>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextInput
          label={t('settings.name')}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <SelectInput
          label={t('settings.language')}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          options={[
            { value: 'en', label: 'English' },
            { value: 'bn', label: 'বাংলা' },
          ]}
        />
        <TextInput label={t('settings.email')} value={user.email ?? '—'} readOnly disabled />
        <TextInput label={t('settings.phone')} value={user.phone ?? '—'} readOnly disabled />
      </div>
      <Button
        className="self-end"
        disabled={name.trim().length < 2}
        loading={save.isPending}
        onClick={() => save.mutate()}
      >
        {t('settings.saveProfile')}
      </Button>
    </Card>
  );
}

function PasswordCard() {
  const { t } = usePreferences();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState({});
  const change = useMutation({
    mutationFn: () => accountApi.changePassword(form),
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '' });
      toast.success(t('settings.changed'));
    },
  });
  const submit = (e) => {
    e.preventDefault();
    const found = validate(form, { currentPassword: 'required', newPassword: 'password' });
    setErrors(found);
    if (!Object.keys(found).length) change.mutate();
  };
  return (
    <Card as="form" title={t('settings.password')} onSubmit={submit} noValidate>
      <FormMessage>{change.error && errorMessage(change.error)}</FormMessage>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextInput
          label={t('settings.current')}
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          error={errors.currentPassword && t(errors.currentPassword)}
          onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
        />
        <TextInput
          label={t('settings.newPass')}
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          error={errors.newPassword && t(errors.newPassword)}
          onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
        />
      </div>
      <Button type="submit" className="self-end" loading={change.isPending}>
        {t('settings.changePass')}
      </Button>
    </Card>
  );
}

function BiodataCard() {
  const { t, lang } = usePreferences();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: MY_BIODATA_KEY, queryFn: biodataApi.mine });
  const restoreQuery = useQuery({
    queryKey: ['restore-request'],
    queryFn: biodataApi.restoreRequest,
    enabled: !!data?.biodata?.deletedAt,
  });
  const [confirm, setConfirm] = useState(false);
  const [del, setDel] = useState({ reason: 'married_via_ghotok', note: '' });
  const [restoreReason, setRestoreReason] = useState('');

  const refresh = (result) => {
    if (result?.biodata) queryClient.setQueryData(MY_BIODATA_KEY, result);
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const hide = useMutation({
    mutationFn: (hidden) => biodataApi.setHidden(hidden),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => biodataApi.remove({ reason: del.reason, note: del.note || undefined }),
    onSuccess: (result) => {
      setConfirm(false);
      refresh(result);
    },
  });
  const restore = useMutation({
    mutationFn: () => biodataApi.requestRestore(restoreReason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restore-request'] });
      toast.success(t('dash.restorePending'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const biodata = data?.biodata;
  if (!biodata) return null;

  if (biodata.deletedAt) {
    const request = restoreQuery.data?.request;
    return (
      <Card title={t('settings.restoreTitle')} id="delete">
        <p className="text-muted">{t('dash.deletedText')}</p>
        {request?.status === 'pending' ? (
          <FormMessage tone="info">{t('dash.restorePending')}</FormMessage>
        ) : (
          <>
            {request && (
              <FormMessage tone="info">
                {optionLabel(RESTORE_STATUS, request.status, lang)}
                {request.note ? `: ${request.note}` : ''}
              </FormMessage>
            )}
            <TextArea
              label={t('settings.restoreReason')}
              rows={3}
              value={restoreReason}
              onChange={(e) => setRestoreReason(e.target.value)}
            />
            <Button className="self-start" loading={restore.isPending} onClick={() => restore.mutate()}>
              {t('dash.requestRestore')}
            </Button>
          </>
        )}
      </Card>
    );
  }

  return (
    <>
      <Card title={t('settings.visibility')}>
        <p className="text-muted">{t('settings.hiddenNote')}</p>
        <Button
          variant="outline"
          className="self-start"
          loading={hide.isPending}
          onClick={() => hide.mutate(!biodata.isHidden)}
        >
          {biodata.isHidden ? t('settings.unhide') : t('settings.hide')}
        </Button>
      </Card>
      <Card title={t('settings.deleteTitle')} id="delete">
        <p className="text-muted">{t('settings.deleteText')}</p>
        <Button variant="outlineRose" className="self-start" onClick={() => setConfirm(true)}>
          {t('dash.delBio')}
        </Button>
      </Card>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('settings.deleteTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t('settings.deleteConfirm')}
            </Button>
          </>
        }
      >
        <FormMessage>{remove.error && errorMessage(remove.error)}</FormMessage>
        <SelectInput
          label={t('settings.deleteReason')}
          value={del.reason}
          onChange={(e) => setDel((d) => ({ ...d, reason: e.target.value }))}
          options={DELETE_REASONS.map((r) => ({ value: r.value, label: r[lang] }))}
        />
        <TextArea
          label={t('settings.deleteNote')}
          rows={3}
          maxLength={500}
          value={del.note}
          onChange={(e) => setDel((d) => ({ ...d, note: e.target.value }))}
        />
      </Modal>
    </>
  );
}

function DeactivateCard() {
  const { t } = usePreferences();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const deactivate = useMutation({
    mutationFn: () => accountApi.deactivate({ password }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(AUTH_KEY, null);
      router.push('/');
    },
  });
  return (
    <Card title={t('settings.deactivateTitle')}>
      <p className="text-muted">{t('settings.deactivateText')}</p>
      <Button variant="ghost" className="self-start text-danger" onClick={() => setOpen(true)}>
        {t('settings.deactivate')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('settings.deactivateTitle')}
        footer={
          <Button
            variant="danger"
            disabled={!password}
            loading={deactivate.isPending}
            onClick={() => deactivate.mutate()}
          >
            {t('settings.deactivate')}
          </Button>
        }
      >
        <FormMessage>{deactivate.error && errorMessage(deactivate.error)}</FormMessage>
        <TextInput
          label={t('settings.confirmPassword')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Modal>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = usePreferences();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <PageTitle title={t('settings.title')} />
      <ProfileCard user={user} />
      <PasswordCard />
      <BiodataCard />
      <DeactivateCard />
    </>
  );
}
