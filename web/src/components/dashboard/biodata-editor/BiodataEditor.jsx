'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BIODATA_SECTIONS, BIODATA_STATUS, optionLabel } from '@ghotok/shared';
import { Button, FormMessage, Icon, LoadingBlock, Pill, STATUS_TONE } from '@ghotok/ui';
import { useErrorMessage } from '@/hooks/use-error-message';
import { biodataApi } from '@/lib/api/endpoints';
import { digits } from '@/lib/format';
import { useT } from '@/providers/PreferencesProvider';
import { useToast } from '@ghotok/ui';
import { PageTitle } from '../DashboardShell.jsx';
import { MY_BIODATA_KEY } from './keys.js';
import { NidPanel } from './NidPanel.jsx';
import { PhotoPanel } from './PhotoPanel.jsx';
import { SectionForm } from './SectionForm.jsx';

const EXTRA_STEPS = [
  { key: 'photo', title: { en: 'Photo', bn: 'ছবি' } },
  { key: 'nid', title: { en: 'NID verification', bn: 'এনআইডি যাচাই' } },
];
const STEPS = [...BIODATA_SECTIONS.map((s) => ({ key: s.key, title: s.title, section: s })), ...EXTRA_STEPS];

function StatusNote({ biodata }) {
  const { t } = useT();
  if (!biodata) return null;
  if (biodata.status === 'approved')
    return <FormMessage tone="success">{t('editor.approvedNote')}</FormMessage>;
  if (biodata.status === 'pending') return <FormMessage tone="info">{t('editor.pendingNote')}</FormMessage>;
  if (biodata.status === 'rejected') {
    return (
      <FormMessage>
        {t('editor.rejectedNote')} {biodata.rejectionReason}
      </FormMessage>
    );
  }
  return null;
}

/** The multi-step biodata editor: one step per form section, plus photo and NID. */
export function BiodataEditor() {
  const { t, lang } = useT();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const { data, isLoading } = useQuery({ queryKey: MY_BIODATA_KEY, queryFn: biodataApi.mine });

  const submit = useMutation({
    mutationFn: () => biodataApi.submit(),
    onSuccess: (result) => {
      queryClient.setQueryData(MY_BIODATA_KEY, result);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(t('editor.submitted'));
    },
  });

  if (isLoading || !data) return <LoadingBlock label={t('common.loading')} />;
  const { biodata, completion } = data;
  const doneByKey = Object.fromEntries(completion.sections.map((s) => [s.key, s.complete]));
  const canSubmit = completion.complete && (!biodata || ['draft', 'rejected'].includes(biodata.status));
  const incomplete = completion.sections
    .filter((s) => !s.complete)
    .map((s) => BIODATA_SECTIONS.find((x) => x.key === s.key).title[lang]);
  const current = STEPS[step];

  return (
    <>
      <PageTitle
        title={t('editor.title')}
        sub={t('editor.sub')}
        action={
          biodata && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-muted">{biodata.biodataNo}</span>
              <Pill tone={STATUS_TONE[biodata.status]}>
                {optionLabel(BIODATA_STATUS, biodata.status, lang)}
              </Pill>
            </div>
          )
        }
      />

      <section className="flex flex-col gap-4 rounded-[28px] border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-60 flex-1 flex-col gap-2">
            <span className="text-sm font-semibold">
              {t('editor.progress', {
                done: digits(completion.done, lang),
                total: digits(completion.total, lang),
              })}
            </span>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-surface2"
              role="progressbar"
              aria-valuenow={completion.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-gold transition-all"
                style={{ width: `${completion.percent}%` }}
              />
            </div>
          </div>
          <Button disabled={!canSubmit} loading={submit.isPending} onClick={() => submit.mutate()}>
            {biodata?.status === 'rejected' ? t('editor.resubmit') : t('editor.submit')}
          </Button>
        </div>
        <StatusNote biodata={biodata} />
        {!completion.complete && incomplete.length < BIODATA_SECTIONS.length && (
          <p className="text-sm text-muted">{t('editor.incomplete', { list: incomplete.join(', ') })}</p>
        )}
        <FormMessage>{submit.error && errorMessage(submit.error)}</FormMessage>
      </section>

      <div className="flex flex-col items-start gap-6 xl:flex-row">
        <nav
          aria-label={t('editor.title')}
          className="-mx-4 flex w-[calc(100%+32px)] gap-2 overflow-x-auto px-4 xl:mx-0 xl:w-60 xl:flex-none xl:flex-col xl:overflow-visible xl:px-0"
        >
          {STEPS.map((s, i) => {
            const done = doneByKey[s.key];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(i)}
                aria-current={i === step ? 'step' : undefined}
                className={`flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2 text-left text-sm font-semibold xl:whitespace-normal ${
                  i === step ? 'bg-rose text-on-rose' : 'border border-line bg-surface hover:border-gold'
                }`}
              >
                <span
                  className={`flex size-6 flex-none items-center justify-center rounded-full text-xs ${done ? 'bg-sage text-white' : i === step ? 'bg-white/25' : 'bg-surface2'}`}
                >
                  {done ? <Icon name="check" size={14} strokeWidth={3} /> : digits(i + 1, lang)}
                </span>
                {s.title[lang]}
              </button>
            );
          })}
        </nav>
        <div className="w-full min-w-0 flex-1">
          {current.section ? (
            <SectionForm
              key={`${current.key}-${biodata?.updatedAt ?? 'new'}`}
              section={current.section}
              sections={biodata?.sections ?? {}}
              isLast={step === STEPS.length - 1}
              onSaved={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
            />
          ) : current.key === 'photo' ? (
            <PhotoPanel biodata={biodata} />
          ) : (
            <NidPanel biodata={biodata} />
          )}
        </div>
      </div>
    </>
  );
}
