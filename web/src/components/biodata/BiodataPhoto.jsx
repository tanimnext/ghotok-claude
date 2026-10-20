'use client';

import { Icon } from '@ghotok/ui';
import { useViewerState } from './BiodataActions.jsx';

/** Round profile photo for the detail page; locked until unlock when the owner chose so. */
export function BiodataPhoto({ biodataNo, publicUrl, hasPhoto, lockedLabel }) {
  const { data: viewer } = useViewerState(biodataNo);
  const url = viewer?.photoUrl ?? publicUrl;
  return (
    <div className="relative flex size-[104px] flex-none items-center justify-center overflow-hidden rounded-full border border-gold bg-surface2">
      {url ? (
        // Signed, short-lived URL: not suitable for the Next.js image cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <Icon name="user" size={52} strokeWidth={1.8} className="text-rose-text" />
      )}
      {!url && hasPhoto && (
        <span
          className="absolute bottom-1.5 flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-muted"
          title={lockedLabel}
        >
          <Icon name="lock" size={11} /> <span className="sr-only">{lockedLabel}</span>
        </span>
      )}
    </div>
  );
}
