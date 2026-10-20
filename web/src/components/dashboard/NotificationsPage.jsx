'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Button, EmptyState, LoadingBlock, Pagination } from '@ghotok/ui';
import { accountApi } from '@/lib/api/endpoints';
import { dateTime, digits } from '@/lib/format';
import { useT } from '@/providers/PreferencesProvider';
import { PageTitle } from './DashboardShell.jsx';

/** Notification text in the reader's language, built from its type and data. */
export function useNotificationText() {
  const { t, lang } = useT();
  return (n) => {
    const d = n.data ?? {};
    const vars = {
      ...d,
      connections: digits(d.connections ?? '', lang),
      balance: digits(d.balance ?? '', lang),
      delta: d.delta > 0 ? `+${digits(d.delta, lang)}` : digits(d.delta ?? '', lang),
      from: d.fromBiodataNo ? t('notifications.fromBiodata', { biodataNo: d.fromBiodataNo }) : '',
      reason: d.reason ?? '',
      note: d.note ?? '',
    };
    const key = `notifications.types.${n.type}`;
    const text = t(key, vars);
    return text === key ? n.type : text;
  };
}

export function NotificationsPage() {
  const { t, lang } = useT();
  const queryClient = useQueryClient();
  const text = useNotificationText();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => accountApi.notifications(page),
  });
  const readAll = useMutation({
    mutationFn: accountApi.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <>
      <PageTitle
        title={t('notifications.title')}
        action={
          data?.unread > 0 && (
            <Button variant="outline" size="sm" loading={readAll.isPending} onClick={() => readAll.mutate()}>
              {t('notifications.markAll')}
            </Button>
          )
        }
      />
      {isLoading || !data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="bell">{t('notifications.empty')}</EmptyState>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-[24px] border border-line bg-surface">
          {data.items.map((n) => {
            const body = (
              <>
                <span
                  className={`mt-1.5 size-2.5 flex-none rounded-full ${n.readAt ? 'bg-transparent' : 'bg-rose'}`}
                  aria-hidden="true"
                />
                <span className="flex flex-col gap-1">
                  <span className={`text-[15px] ${n.readAt ? '' : 'font-bold'}`}>{text(n)}</span>
                  <span className="text-[13px] text-muted">{dateTime(n.createdAt, lang)}</span>
                </span>
              </>
            );
            return (
              <li key={n._id} className="border-b border-line last:border-0">
                {n.link ? (
                  <Link href={n.link} className="flex gap-4 px-6 py-4 hover:bg-surface2">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-4 px-6 py-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data && (
        <Pagination
          page={data.page}
          pages={data.pages}
          onPage={setPage}
          labels={{ previous: t('common.previous'), next: t('common.next') }}
        />
      )}
    </>
  );
}
