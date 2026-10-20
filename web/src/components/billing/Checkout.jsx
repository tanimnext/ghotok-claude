'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { isValidPhone } from '@ghotok/shared';
import { Button, Card, FormMessage, Icon, TextInput } from '@ghotok/ui';
import { AUTH_KEY, useAuth } from '@/hooks/use-auth';
import { useErrorMessage } from '@/hooks/use-error-message';
import { billingApi } from '@/lib/api/endpoints';
import { digits, number, taka } from '@/lib/format';
import { useT } from '@/providers/PreferencesProvider';

function Choice({ checked, onChange, name, children, disabled }) {
  return (
    <label
      className={`flex cursor-pointer flex-col gap-2 rounded-[20px] p-5 transition ${
        checked ? 'border-[2.5px] border-rose bg-surface2' : 'border-[1.5px] border-line hover:border-gold'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      {children}
    </label>
  );
}

/** Instructions text with <b> emphasis from the dictionary, rendered safely. */
function Rich({ text }) {
  const parts = text.split(/(<b>.*?<\/b>)/g);
  return parts.map((part, i) =>
    part.startsWith('<b>') ? (
      <b key={i} className="text-ink">
        {part.slice(3, -4)}
      </b>
    ) : (
      part
    ),
  );
}

/**
 * Buying a connection package in three steps: package, method, payment.
 * With a configured gateway (bKash/Nagad) the member can pay online; otherwise
 * — and always for Rocket — they send money and submit the transaction ID.
 */
export function Checkout({ catalogue, initialPackageId }) {
  const { t, lang } = useT();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const { packages, methods, verificationHours } = catalogue;
  const enabledMethods = methods.filter((m) => m.enabled);

  const defaultPackage =
    packages.find((p) => p.id === initialPackageId) ?? packages.find((p) => p.highlight) ?? packages[0];
  const [packageId, setPackageId] = useState(defaultPackage?.id);
  const [method, setMethod] = useState(enabledMethods[0]?.value);
  const [form, setForm] = useState({ senderNumber: '', trxId: '' });
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);

  const pkg = packages.find((p) => p.id === packageId);
  const m = methods.find((x) => x.value === method);
  const methodName = m?.[lang] ?? '';

  const pay = useMutation({
    mutationFn: (mode) =>
      billingApi.createPayment({ packageId, method, mode, ...(mode === 'manual' ? form : {}) }),
    onSuccess: (result) => {
      if (result.redirectURL) {
        window.location.assign(result.redirectURL);
        return;
      }
      setDone(result.payment);
      queryClient.invalidateQueries({ queryKey: AUTH_KEY });
    },
  });

  const submitManual = (e) => {
    e.preventDefault();
    const next = {};
    if (!isValidPhone(form.senderNumber)) next.senderNumber = t('packages.errSender');
    if (!/^[A-Za-z0-9]{6,20}$/.test(form.trxId.trim())) next.trxId = t('packages.errTrx');
    setErrors(next);
    if (!Object.keys(next).length) pay.mutate('manual');
  };

  if (!pkg) return null;

  if (done) {
    return (
      <Card className="items-start">
        <span className="flex size-14 items-center justify-center rounded-full bg-sage-bg text-sage">
          <Icon name="check" size={28} strokeWidth={2.6} />
        </span>
        <h2 className="font-display text-3xl font-medium">{t('packages.successTitle')}</h2>
        <p className="max-w-xl text-muted">
          {t('packages.successText', { trx: done.trxId, n: digits(done.connections, lang) })}
        </p>
        <Button href="/dashboard/connections">{t('packages.goBilling')}</Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col items-start gap-7 lg:flex-row">
      <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
        <Card title={t('packages.step1')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {packages.map((p) => (
              <Choice
                key={p.id}
                name="package"
                checked={p.id === packageId}
                onChange={() => setPackageId(p.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[15px] font-bold ${p.id === packageId ? 'text-rose-text' : 'text-muted'}`}
                  >
                    {p.name[lang] || p.name.en}
                  </span>
                  {p.highlight && (
                    <span className="rounded-full bg-panel-gold px-2.5 py-1 text-[11px] font-bold text-[#3B1624]">
                      {t('packages.popular')}
                    </span>
                  )}
                </span>
                <span className="font-display text-[40px] font-medium leading-none">
                  {taka(p.price, lang)}
                </span>
                <span className="text-base font-semibold">
                  {t('common.connections', { n: digits(p.connections, lang) })}
                </span>
                <span className="text-sm text-muted">
                  {t('packages.perConnection', { n: number(p.perConnection, lang) })}
                </span>
              </Choice>
            ))}
          </div>
        </Card>

        <Card title={t('packages.step2')}>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {methods.map((x) => (
              <Choice
                key={x.value}
                name="method"
                checked={x.value === method}
                disabled={!x.enabled}
                onChange={() => setMethod(x.value)}
              >
                <span className="text-base font-bold">{x[lang]}</span>
                {!x.enabled && <span className="text-xs text-muted">{t('packages.unavailable')}</span>}
              </Choice>
            ))}
          </div>
        </Card>

        <Card title={t('packages.step3')}>
          {!isLoading && !user ? (
            <Button href="/login?next=/packages" size="lg">
              {t('packages.loginFirst')}
            </Button>
          ) : (
            <>
              <FormMessage>{pay.error && errorMessage(pay.error)}</FormMessage>
              {m?.gateway && (
                <div className="flex flex-col gap-3 rounded-[20px] bg-surface2 p-5">
                  <p className="text-sm text-muted">{t('packages.onlineNote', { method: methodName })}</p>
                  <Button
                    size="lg"
                    loading={pay.isPending && pay.variables === 'gateway'}
                    onClick={() => pay.mutate('gateway')}
                  >
                    {t('packages.onlineCheckout', { method: methodName })}
                  </Button>
                  <span className="pt-2 text-center text-sm font-semibold text-muted">
                    {t('packages.or')}
                  </span>
                </div>
              )}
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed text-muted">
                <li>
                  <Rich
                    text={t(m?.manualNumber ? 'packages.instructions1' : 'packages.instructions1NoNumber', {
                      method: methodName,
                      number: m?.manualNumber,
                      amount: number(pkg.price, lang),
                    })}
                  />
                </li>
                <li>{t('packages.instructions2')}</li>
                <li>{t('packages.instructions3', { hours: digits(verificationHours, lang) })}</li>
              </ol>
              <form className="flex flex-col gap-4" onSubmit={submitManual} noValidate>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextInput
                    label={t('packages.senderNumber', { method: methodName })}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="01XXXXXXXXX"
                    required
                    value={form.senderNumber}
                    error={errors.senderNumber}
                    onChange={(e) => setForm((f) => ({ ...f, senderNumber: e.target.value }))}
                  />
                  <TextInput
                    label={t('packages.trxId')}
                    placeholder={t('packages.trxPh')}
                    required
                    autoCapitalize="characters"
                    value={form.trxId}
                    error={errors.trxId}
                    onChange={(e) => setForm((f) => ({ ...f, trxId: e.target.value }))}
                  />
                </div>
                <Button type="submit" size="lg" loading={pay.isPending && pay.variables === 'manual'}>
                  {t('packages.submit')}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>

      <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-28 lg:w-[360px] lg:flex-none">
        <section className="flex flex-col gap-4 rounded-[28px] bg-panel p-7 text-on-panel">
          <h2 className="font-display text-xl font-semibold">{t('packages.summary')}</h2>
          <div className="flex justify-between text-[15px] text-panel-muted">
            <span>
              {pkg.name[lang] || pkg.name.en} ·{' '}
              {t('common.connections', { n: digits(pkg.connections, lang) })}
            </span>
            <span>{taka(pkg.price, lang)}</span>
          </div>
          <div className="flex justify-between text-[15px] text-panel-muted">
            <span>{t('packages.method')}</span>
            <span>{methodName}</span>
          </div>
          <div className="flex justify-between border-t border-panel-line pt-4 text-xl font-extrabold">
            <span>{t('packages.total')}</span>
            <span>{taka(pkg.price, lang)}</span>
          </div>
          {user && (
            <p className="text-sm text-panel-muted">
              {t('packages.after', {
                n: t('common.connections', { n: digits(user.connectionBalance + pkg.connections, lang) }),
              })}
            </p>
          )}
        </section>
        <section className="flex flex-col gap-2 rounded-[20px] bg-sage-bg p-6">
          <b className="text-[15px] text-sage">{t('packages.refundTitle')}</b>
          <p className="text-sm leading-relaxed">
            {t('packages.refundText')}{' '}
            <Link href="/refund-policy" className="font-semibold underline">
              {t('packages.refundLink')}
            </Link>
            .
          </p>
        </section>
      </aside>
    </div>
  );
}
