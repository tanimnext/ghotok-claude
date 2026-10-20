'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { NID_STATUS, optionLabel } from '@ghotok/shared';
import { Button, Card, FormMessage, Pill, STATUS_TONE } from '@ghotok/ui';
import { useErrorMessage } from '@/hooks/use-error-message';
import { biodataApi } from '@/lib/api/endpoints';
import { useT } from '@/providers/PreferencesProvider';
import { MY_BIODATA_KEY } from './keys.js';
import { IMAGE_TYPES, fileProblem, uploadWithTicket } from './upload.js';

function FilePick({ label, file, onPick }) {
  return (
    <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-[20px] border-[1.5px] border-dashed border-gold bg-bg p-4 text-center hover:bg-surface2">
      <span className="font-bold">{label}</span>
      <span className="max-w-full truncate text-sm text-muted">{file?.name ?? 'JPG / PNG / WEBP'}</span>
      <input
        type="file"
        accept={IMAGE_TYPES.join(',')}
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

/** Upload both sides of the National ID for the "NID verified" badge. Only reviewers see them. */
export function NidPanel({ biodata }) {
  const { t, lang } = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState({ front: null, back: null });
  const [problem, setProblem] = useState(null);
  const status = biodata?.nid?.status ?? 'not_submitted';

  const submit = useMutation({
    mutationFn: async () => {
      const [frontTicket, backTicket] = await Promise.all(
        ['front', 'back'].map((side) =>
          uploadWithTicket(() => biodataApi.nidUploadUrl(side, files[side].type), files[side]),
        ),
      );
      return biodataApi.submitNid({ frontTicket, backTicket });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(MY_BIODATA_KEY, result);
      setFiles({ front: null, back: null });
    },
  });

  const pick = (side) => (file) => {
    const issue = file && fileProblem(file);
    setProblem(issue || null);
    if (!issue) setFiles((f) => ({ ...f, [side]: file }));
  };

  return (
    <Card
      title={t('editor.nidTitle')}
      action={<Pill tone={STATUS_TONE[status]}>{optionLabel(NID_STATUS, status, lang)}</Pill>}
    >
      <p className="text-[15px] leading-relaxed text-muted">{t('editor.nidText')}</p>
      {biodata?.nid?.note && status === 'rejected' && <FormMessage>{biodata.nid.note}</FormMessage>}
      <FormMessage>{(problem && t(problem)) || (submit.error && errorMessage(submit.error))}</FormMessage>
      {status !== 'verified' && status !== 'pending' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FilePick label={t('editor.nidFront')} file={files.front} onPick={pick('front')} />
            <FilePick label={t('editor.nidBack')} file={files.back} onPick={pick('back')} />
          </div>
          <Button
            className="self-start"
            disabled={!files.front || !files.back}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {t('editor.nidSubmit')}
          </Button>
        </>
      )}
    </Card>
  );
}
