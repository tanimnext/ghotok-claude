'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TICKET_CATEGORIES, TICKET_STATUS, optionLabel } from '@ghotok/shared';
import {
  Button,
  Card,
  EmptyState,
  FormMessage,
  Icon,
  LoadingBlock,
  Pagination,
  Pill,
  STATUS_TONE,
  SelectInput,
  TextArea,
  TextInput,
} from '@/components/ui';
import { useErrorMessage } from '@/hooks/use-error-message';
import { supportApi } from '@/lib/api/endpoints';
import { date, dateTime } from '@/lib/format';
import { useT } from '@/providers/PreferencesProvider';
import { PageTitle } from './DashboardShell.jsx';

function NewTicketForm({ onCreated }) {
  const { t, lang } = useT();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState({ subject: '', category: 'other', message: '' });
  const create = useMutation({
    mutationFn: () => supportApi.open(form),
    onSuccess: ({ ticket }) => onCreated(ticket),
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <Card
      as="form"
      title={t('support.new')}
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <FormMessage>{create.error && errorMessage(create.error)}</FormMessage>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextInput
          label={t('support.subject')}
          required
          minLength={4}
          maxLength={160}
          value={form.subject}
          onChange={set('subject')}
        />
        <SelectInput
          label={t('support.category')}
          value={form.category}
          onChange={set('category')}
          options={TICKET_CATEGORIES.map((c) => ({ value: c.value, label: c[lang] }))}
        />
      </div>
      <TextArea
        label={t('support.message')}
        required
        minLength={10}
        rows={5}
        maxLength={5000}
        value={form.message}
        onChange={set('message')}
        hint={t('validation.message')}
      />
      <Button
        type="submit"
        className="self-end"
        disabled={form.subject.trim().length < 4 || form.message.trim().length < 10}
        loading={create.isPending}
      >
        {t('support.create')}
      </Button>
    </Card>
  );
}

/** The member's support tickets, with a form to open a new one. */
export function SupportPage({ startNew }) {
  const { t, lang } = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(!!startNew);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['tickets', page],
    queryFn: () => supportApi.tickets(page),
  });

  return (
    <>
      <PageTitle
        title={t('support.title')}
        sub={t('support.sub')}
        action={
          !showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Icon name="plus" size={18} /> {t('support.new')}
            </Button>
          )
        }
      />
      {showForm && (
        <NewTicketForm
          onCreated={(ticket) => {
            queryClient.invalidateQueries({ queryKey: ['tickets'] });
            router.push(`/dashboard/support/${ticket.id}`);
          }}
        />
      )}
      {isLoading || !data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : data.items.length === 0 ? (
        !showForm && <EmptyState icon="ticket">{t('support.empty')}</EmptyState>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-[24px] border border-line bg-surface">
          {data.items.map((ticket) => (
            <li key={ticket.id} className="border-b border-line last:border-0">
              <Link
                href={`/dashboard/support/${ticket.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-surface2"
              >
                <span className="flex flex-col gap-0.5">
                  <b className="text-[15px]">
                    {ticket.ticketNo} · {ticket.subject}
                  </b>
                  <span className="text-[13px] text-muted">
                    {optionLabel(TICKET_CATEGORIES, ticket.category, lang)} ·{' '}
                    {t('support.lastActivity', { date: date(ticket.lastMessageAt, lang) })}
                  </span>
                </span>
                <Pill tone={STATUS_TONE[ticket.status]}>
                  {optionLabel(TICKET_STATUS, ticket.status, lang)}
                </Pill>
              </Link>
            </li>
          ))}
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

/** One ticket's conversation, with a reply box. */
export function TicketThread({ id }) {
  const { t, lang } = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const key = ['ticket', id];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => supportApi.get(id) });
  const update = ({ ticket }) => {
    queryClient.setQueryData(key, { ticket: { ...data.ticket, ...ticket } });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
  };
  const reply = useMutation({
    mutationFn: () => supportApi.reply(id, message),
    onSuccess: (res) => {
      setMessage('');
      update(res);
    },
  });
  const close = useMutation({ mutationFn: () => supportApi.close(id), onSuccess: update });

  if (error) return <EmptyState icon="ticket">{errorMessage(error)}</EmptyState>;
  if (isLoading || !data) return <LoadingBlock label={t('common.loading')} />;
  const ticket = data.ticket;
  const closed = ticket.status === 'closed';

  return (
    <>
      <Link
        href="/dashboard/support"
        className="flex items-center gap-1 text-sm font-bold text-muted hover:text-rose-text"
      >
        <Icon name="chevronLeft" size={16} /> {t('support.title')}
      </Link>
      <PageTitle
        title={ticket.subject}
        sub={`${ticket.ticketNo} · ${optionLabel(TICKET_CATEGORIES, ticket.category, lang)}`}
        action={
          <Pill tone={STATUS_TONE[ticket.status]}>{optionLabel(TICKET_STATUS, ticket.status, lang)}</Pill>
        }
      />
      <ol className="flex flex-col gap-4">
        {(ticket.messages ?? []).map((m) => (
          <li
            key={m.id}
            className={`flex flex-col gap-1.5 rounded-[24px] p-5 sm:max-w-[80%] ${m.staff ? 'self-start border border-gold bg-surface2' : 'self-end bg-surface'}`}
          >
            <span className="text-[13px] font-bold text-muted">
              {m.staff ? m.author.name : t('support.you')} · {dateTime(m.createdAt, lang)}
            </span>
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{m.body}</p>
          </li>
        ))}
      </ol>
      {closed ? (
        <FormMessage tone="info">{t('support.closed')}</FormMessage>
      ) : (
        <Card
          as="form"
          onSubmit={(e) => {
            e.preventDefault();
            reply.mutate();
          }}
        >
          <FormMessage>{reply.error && errorMessage(reply.error)}</FormMessage>
          <TextArea
            label={t('support.reply')}
            rows={4}
            maxLength={5000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="ghost" loading={close.isPending} onClick={() => close.mutate()}>
              {t('support.close')}
            </Button>
            <Button type="submit" disabled={!message.trim()} loading={reply.isPending}>
              {t('support.send')}
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
