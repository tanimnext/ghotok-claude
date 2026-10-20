import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, PromptDialog, useToast } from '@ghotok/ui';
import { useErrorMessage } from '../hooks/useErrorMessage.js';
import { adminApi } from '../lib/api.js';
import { useT } from '../providers/PreferencesProvider.jsx';

/** Restore / Decline buttons for a request in the recovery queue. */
export function RestoreDecision({ requestId }) {
  const { t } = useT();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [declining, setDeclining] = useState(false);
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ['restore-requests'] });
    queryClient.invalidateQueries({ queryKey: ['overview'] });
  };
  const approve = useMutation({
    mutationFn: () => adminApi.approveRestore(requestId),
    onSuccess: done,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const decline = useMutation({
    mutationFn: (note) => adminApi.declineRestore(requestId, note || undefined),
    onSuccess: () => {
      setDeclining(false);
      done();
    },
  });
  return (
    <span className="flex flex-wrap gap-2">
      <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate()}>
        {t('common.restore')}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setDeclining(true)}>
        {t('common.decline')}
      </Button>
      <PromptDialog
        open={declining}
        title={t('common.decline')}
        label={t('recovery.declineNote')}
        required={false}
        confirmLabel={t('common.decline')}
        cancelLabel={t('common.cancel')}
        loading={decline.isPending}
        error={decline.error && errorMessage(decline.error)}
        onConfirm={(note) => decline.mutate(note)}
        onClose={() => setDeclining(false)}
      />
    </span>
  );
}
