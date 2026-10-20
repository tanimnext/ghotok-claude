'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { PHOTO_VISIBILITY } from '@ghotok/shared';
import { ArchPortrait } from '@/components/biodata/ArchPortrait';
import { Button, Card, FormMessage, SelectInput } from '@ghotok/ui';
import { useErrorMessage } from '@/hooks/use-error-message';
import { biodataApi } from '@/lib/api/endpoints';
import { useT } from '@/providers/PreferencesProvider';
import { MY_BIODATA_KEY } from './keys.js';
import { IMAGE_TYPES, fileProblem, uploadWithTicket } from './upload.js';

/** Optional profile photo with a visibility choice (hidden until unlock by default). */
export function PhotoPanel({ biodata }) {
  const { t, lang } = useT();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const input = useRef(null);
  const [problem, setProblem] = useState(null);
  const photo = biodata?.photo;
  const update = (result) => queryClient.setQueryData(MY_BIODATA_KEY, result);

  const upload = useMutation({
    mutationFn: async (file) => {
      const ticket = await uploadWithTicket(() => biodataApi.photoUploadUrl(), file);
      return biodataApi.attachPhoto({ ticket, visibility: photo?.visibility });
    },
    onSuccess: update,
  });
  const visibility = useMutation({ mutationFn: (v) => biodataApi.setPhotoVisibility(v), onSuccess: update });
  const remove = useMutation({ mutationFn: () => biodataApi.removePhoto(), onSuccess: update });

  const choose = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const issue = fileProblem(file);
    setProblem(issue);
    if (!issue) upload.mutate(file);
  };

  const error = upload.error || visibility.error || remove.error;
  return (
    <Card title={t('editor.photoTitle')}>
      <p className="text-[15px] leading-relaxed text-muted">{t('editor.photoText')}</p>
      <FormMessage>{(problem && t(problem)) || (error && errorMessage(error))}</FormMessage>
      <div className="flex flex-wrap items-center gap-6">
        <ArchPortrait photoUrl={photo?.url} className="h-[180px] w-[150px] flex-none" />
        <div className="flex flex-1 basis-60 flex-col gap-4">
          <input
            ref={input}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            className="sr-only"
            onChange={choose}
            tabIndex={-1}
          />
          <div className="flex flex-wrap gap-3">
            <Button loading={upload.isPending} onClick={() => input.current?.click()}>
              {upload.isPending
                ? t('editor.uploading')
                : photo
                  ? t('editor.photoReplace')
                  : t('editor.photoUpload')}
            </Button>
            {photo && (
              <Button variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>
                {t('editor.photoRemove')}
              </Button>
            )}
          </div>
          <span className="text-[13px] text-muted">{t('editor.fileHint')}</span>
          {photo && (
            <SelectInput
              label={t('editor.photoVisibility')}
              value={photo.visibility}
              onChange={(e) => visibility.mutate(e.target.value)}
              options={PHOTO_VISIBILITY.map((o) => ({ value: o.value, label: o[lang] }))}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
