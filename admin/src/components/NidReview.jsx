import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, FormMessage, LoadingBlock, Modal, TextArea, useToast } from '@ghotok/ui';
import { useErrorMessage } from '../hooks/useErrorMessage.js';
import { adminApi } from '../lib/api.js';
import { useT } from '../providers/PreferencesProvider.jsx';

/**
 * Opens a biodata's NID images (short-lived links; every view is audited) and
 * lets the reviewer verify or reject them while they are pending.
 */
export function NidReview({ biodataId, biodataNo, open, onClose }) {
  const { t } = useT();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const docs = useQuery({
    queryKey: ['nid', biodataId],
    queryFn: () => adminApi.nidDocuments(biodataId),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });
  const done = () => {
    ['biodatas', 'biodata', 'overview'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    setNote('');
    onClose();
  };
  const verify = useMutation({
    mutationFn: () => adminApi.verifyNid(biodataId),
    onSuccess: () => {
      toast.success(`${biodataNo} ✓`);
      done();
    },
  });
  const reject = useMutation({
    mutationFn: () => adminApi.rejectNid(biodataId, note.trim()),
    onSuccess: done,
  });
  const error = docs.error || verify.error || reject.error;
  const pending = docs.data?.status === 'pending';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${t('nid.title')} · ${biodataNo}`}
      footer={
        pending && (
          <>
            <Button
              variant="outline"
              disabled={note.trim().length < 3}
              loading={reject.isPending}
              onClick={() => reject.mutate()}
            >
              {t('nid.reject')}
            </Button>
            <Button loading={verify.isPending} onClick={() => verify.mutate()}>
              {t('nid.verify')}
            </Button>
          </>
        )
      }
    >
      <FormMessage>{error && errorMessage(error)}</FormMessage>
      {docs.isLoading ? (
        <LoadingBlock label={t('common.loading')} />
      ) : (
        docs.data && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              ['front', docs.data.front],
              ['back', docs.data.back],
            ].map(([side, url]) => (
              <figure key={side} className="flex flex-col gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-2xl border border-line bg-bg"
                >
                  <img src={url} alt={t(`nid.${side}`)} className="max-h-72 w-full object-contain" />
                </a>
                <figcaption className="text-sm font-semibold text-muted">{t(`nid.${side}`)}</figcaption>
              </figure>
            ))}
          </div>
        )
      )}
      <p className="text-xs text-muted">{t('nid.linkExpires')}</p>
      {pending && (
        <TextArea
          label={t('nid.rejectNote')}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
    </Modal>
  );
}
