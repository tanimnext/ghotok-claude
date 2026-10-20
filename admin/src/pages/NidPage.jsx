import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { BIODATA_TYPES, NID_STATUS, optionLabel } from '@ghotok/shared';
import { dateTime } from '@ghotok/shared/format';
import { Button, Pill, STATUS_TONE, Tabs } from '@ghotok/ui';
import { DataCard } from '../components/DataCard.jsx';
import { NidReview } from '../components/NidReview.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { UserCell } from '../components/UserCell.jsx';
import { usePageParam, useQueryParam } from '../hooks/useQueryParam.js';
import { adminApi } from '../lib/api.js';
import { useT } from '../providers/PreferencesProvider.jsx';

const TABS = ['pending', 'verified', 'rejected'];

export function NidPage() {
  const { t, lang } = useT();
  const [status, setStatus] = useQueryParam('status', 'pending');
  const [page, setPage] = usePageParam();
  const [reviewing, setReviewing] = useState(null);
  const query = useQuery({
    queryKey: ['biodatas', 'nid', status, page],
    queryFn: () => adminApi.biodatas({ nid: status, page }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title={t('nid.title')} sub={t('nid.sub')} />
      <Tabs
        value={status}
        onChange={setStatus}
        items={TABS.map((v) => ({ value: v, label: optionLabel(NID_STATUS, v, lang) }))}
      />
      <DataCard query={query} page={page} onPage={setPage}>
        {(items) => (
          <div className="overflow-x-auto">
            <table className="table-admin min-w-[720px]">
              <thead>
                <tr>
                  <th>{t('biodatas.cols.biodata')}</th>
                  <th>{t('biodatas.cols.owner')}</th>
                  <th>{t('biodatas.cols.type')}</th>
                  <th>{t('biodatas.cols.submitted')}</th>
                  <th>{t('biodatas.cols.nid')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link to={`/biodatas/${b.id}`} className="font-bold text-rose-text hover:underline">
                        {b.biodataNo}
                      </Link>
                    </td>
                    <td>
                      <UserCell user={b.user} />
                    </td>
                    <td>{optionLabel(BIODATA_TYPES, b.type, lang)}</td>
                    <td className="whitespace-nowrap">{dateTime(b.nidSubmittedAt, lang) || '—'}</td>
                    <td>
                      <Pill tone={STATUS_TONE[b.nidStatus]}>
                        {optionLabel(NID_STATUS, b.nidStatus, lang)}
                      </Pill>
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant={b.nidStatus === 'pending' ? 'primary' : 'outline'}
                        onClick={() => setReviewing(b)}
                      >
                        {b.nidStatus === 'pending' ? t('common.review') : t('nid.viewDocs')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>
      <NidReview
        biodataId={reviewing?.id}
        biodataNo={reviewing?.biodataNo}
        open={!!reviewing}
        onClose={() => setReviewing(null)}
      />
    </>
  );
}
