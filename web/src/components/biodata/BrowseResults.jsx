'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { SORT_OPTIONS } from '@ghotok/shared';
import { EmptyState, Pagination } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { biodataApi } from '@/lib/api/endpoints';
import { number } from '@/lib/format';
import { toQueryString } from '@/lib/search-params';
import { useT } from '@/providers/PreferencesProvider';
import { BiodataCard } from './BiodataCard.jsx';

/**
 * Search results. The server renders the anonymous results (fast, indexable);
 * for signed-in members they are re-fetched with the session so biodatas the
 * member marked "Not interested" — and their own — are left out.
 */
export function BrowseResults({ params, initial }) {
  const { t, lang } = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['search', params, user?.id],
    queryFn: () => biodataApi.search(params),
    enabled: !!user,
    placeholderData: keepPreviousData,
    initialData: user ? undefined : initial,
  });
  const result = data ?? initial;

  const go = (next) => router.push(`/biodatas${toQueryString({ ...params, ...next })}`);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-muted" aria-live="polite">
          {t('browse.results', { n: number(result.total, lang) })}
        </p>
        <label className="flex items-center gap-2.5 text-sm text-muted">
          {t('browse.sort')}
          <select
            className="field-input min-h-11 w-auto py-2"
            value={params.sort ?? 'newest'}
            onChange={(e) => go({ sort: e.target.value, page: undefined })}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o[lang]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {result.items.length === 0 ? (
        <EmptyState icon="search" title={t('browse.empty')}>
          {t('browse.emptyHint')}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {result.items.map((b) => (
            <BiodataCard key={b.id} biodata={b} />
          ))}
        </div>
      )}

      <Pagination
        page={result.page}
        pages={result.pages}
        hrefFor={(p) => `/biodatas${toQueryString({ ...params, page: p })}`}
        labels={{ previous: t('common.previous'), next: t('common.next') }}
      />
    </div>
  );
}
