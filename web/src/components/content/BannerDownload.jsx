'use client';

import { useMutation } from '@tanstack/react-query';
import { Button, useToast } from '@ghotok/ui';
import { useErrorMessage } from '@/hooks/use-error-message';
import { contentApi } from '@/lib/api/endpoints';
import { useT } from '@/providers/PreferencesProvider';

/** Counts the download and opens the banner's short-lived PDF link. */
export function BannerDownload({ id }) {
  const { t } = useT();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const download = useMutation({
    mutationFn: () => contentApi.downloadBanner(id),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Button block loading={download.isPending} onClick={() => download.mutate()}>
      {t('banners.download')}
    </Button>
  );
}
