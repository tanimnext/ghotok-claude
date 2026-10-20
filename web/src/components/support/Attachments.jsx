'use client';

import { useRef, useState } from 'react';
import { Icon } from '@ghotok/ui';
import { uploadFile } from '@/lib/api/client';
import { supportApi } from '@/lib/api/endpoints';
import { useT } from '@/providers/PreferencesProvider';

const MB = 1024 * 1024;
// Must match the API's accepted types and limits (server/src/integrations/storage/file-types.js).
const LIMITS = {
  'image/jpeg': 5 * MB,
  'image/png': 5 * MB,
  'image/webp': 5 * MB,
  'application/pdf': 10 * MB,
  'video/mp4': 25 * MB,
  'video/webm': 25 * MB,
};
export const MAX_ATTACHMENTS = 5;

/**
 * Files attached to a support message or report. Each file uploads as soon as it
 * is picked; `tickets` are the signed upload tickets to send with the message.
 */
export function useAttachments() {
  const [items, setItems] = useState([]); // { id, name, status: 'uploading'|'done'|'error', ticket?, error? }
  const patch = (id, change) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));

  const add = (files) => {
    const room = MAX_ATTACHMENTS - items.length;
    for (const file of [...files].slice(0, Math.max(room, 0))) {
      const id = crypto.randomUUID();
      const limit = LIMITS[file.type];
      const problem = !limit ? 'attachments.badType' : file.size > limit ? 'attachments.tooBig' : null;
      setItems((list) => [
        ...list,
        { id, name: file.name, status: problem ? 'error' : 'uploading', error: problem },
      ]);
      if (problem) continue;
      supportApi
        .attachmentUploadUrl({ contentType: file.type, size: file.size, name: file.name.slice(0, 120) })
        .then(async (target) => {
          await uploadFile(target, file);
          patch(id, { status: 'done', ticket: target.ticket });
        })
        .catch(() => patch(id, { status: 'error', error: 'attachments.failed' }));
    }
  };

  return {
    items,
    add,
    remove: (id) => setItems((list) => list.filter((i) => i.id !== id)),
    reset: () => setItems([]),
    uploading: items.some((i) => i.status === 'uploading'),
    tickets: items.filter((i) => i.status === 'done').map((i) => i.ticket),
  };
}

/** "Attach files" button with the list of picked files. */
export function AttachmentPicker({ attachments }) {
  const { t } = useT();
  const input = useRef(null);
  const full = attachments.items.length >= MAX_ATTACHMENTS;
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={Object.keys(LIMITS).join(',')}
        onChange={(e) => {
          attachments.add(e.target.files);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={full}
        onClick={() => input.current?.click()}
        className="flex min-h-11 items-center gap-2 self-start rounded-full border border-dashed border-line px-4 text-sm font-semibold hover:border-gold disabled:opacity-50"
      >
        <Icon name="upload" size={16} /> {t('attachments.add')}
      </button>
      <span className="text-[13px] text-muted">{t('attachments.hint')}</span>
      {attachments.items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {attachments.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-surface2 px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon name="file" size={16} className="flex-none" />
                <span className="truncate">{item.name}</span>
                <span
                  className={`flex-none text-[13px] ${item.status === 'error' ? 'font-semibold text-danger' : 'text-muted'}`}
                >
                  {item.status === 'uploading'
                    ? t('editor.uploading')
                    : item.status === 'error'
                      ? t(item.error)
                      : t('attachments.ready')}
                </span>
              </span>
              <button
                type="button"
                onClick={() => attachments.remove(item.id)}
                aria-label={t('attachments.remove', { name: item.name })}
                className="flex size-9 flex-none items-center justify-center rounded-full hover:bg-surface"
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Attachments of a sent message: image thumbnails, playable videos and PDF links. */
export function AttachmentList({ files }) {
  const { t } = useT();
  if (!files?.length) return null;
  return (
    <div className="flex flex-wrap gap-2.5 pt-1">
      {files.map((f) =>
        f.type?.startsWith('image/') ? (
          <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="block">
            {/* Signed, short-lived private links: next/image cannot cache them. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.url}
              alt={f.name ?? t('attachments.image')}
              className="h-28 w-28 rounded-xl border border-line object-cover"
            />
          </a>
        ) : f.type?.startsWith('video/') ? (
          <video key={f.url} src={f.url} controls preload="metadata" className="max-h-56 rounded-xl">
            <track kind="captions" />
          </video>
        ) : (
          <a
            key={f.url}
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold hover:border-gold"
          >
            <Icon name="file" size={16} /> {f.name ?? t('attachments.file')}
          </a>
        ),
      )}
    </div>
  );
}
