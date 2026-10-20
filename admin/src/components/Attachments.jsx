import { useState } from 'react';
import { formatNumber } from '@ghotok/shared';
import { FormMessage, Icon, Spinner } from '@ghotok/ui';
import { useErrorMessage } from '../hooks/useErrorMessage.js';
import { adminApi, uploadWithTicket } from '../lib/api.js';
import { useT } from '../providers/PreferencesProvider.jsx';

const MB = 1024 * 1024;
// Same limits as the API (server/src/integrations/storage/file-types.js).
const LIMITS = {
  'image/jpeg': 5 * MB,
  'image/png': 5 * MB,
  'image/webp': 5 * MB,
  'application/pdf': 10 * MB,
  'video/mp4': 25 * MB,
  'video/webm': 25 * MB,
};
const MAX_FILES = 5;

const sizeLabel = (bytes, lang) =>
  bytes >= MB
    ? `${formatNumber(Math.round((bytes / MB) * 10) / 10, lang)} MB`
    : `${formatNumber(Math.max(1, Math.round(bytes / 1024)), lang)} KB`;

/** The files attached to a support message: image thumbnails, other files as links. */
export function AttachmentList({ items }) {
  const { t, lang } = useT();
  if (!items?.length) return null;
  return (
    <ul className="flex flex-wrap gap-3" aria-label={t('tickets.attachments')}>
      {items.map((a) => (
        <li key={a.url}>
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 text-sm font-semibold hover:border-gold"
          >
            {a.type?.startsWith('image/') ? (
              <img src={a.url} alt={a.name ?? ''} className="size-20 rounded-xl object-cover" />
            ) : (
              <Icon name="file" size={18} />
            )}
            {!a.type?.startsWith('image/') && (
              <span className="flex flex-col pr-2">
                <span className="max-w-48 truncate">{a.name || t('tickets.file')}</span>
                {a.size && <span className="text-xs font-normal text-muted">{sizeLabel(a.size, lang)}</span>}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Uploads files as soon as they are chosen and keeps their tickets for the reply.
 * `value` is an array of { ticket, name, size }.
 */
export function AttachmentPicker({ value, onChange, disabled }) {
  const { t, lang } = useT();
  const errorMessage = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const full = disabled || busy || value.length >= MAX_FILES;

  const pick = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    setError(null);
    if (value.length + files.length > MAX_FILES) return setError(t('tickets.tooManyFiles', { n: MAX_FILES }));
    const bad = files.find((f) => !LIMITS[f.type] || f.size > LIMITS[f.type]);
    if (bad) return setError(t('tickets.badFile', { name: bad.name }));
    setBusy(true);
    try {
      const added = [];
      for (const file of files) {
        const ticket = await uploadWithTicket(adminApi.attachmentUploadUrl, file, {
          name: file.name.slice(0, 120),
        });
        added.push({ ticket, name: file.name, size: file.size });
      }
      onChange([...value, ...added]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <FormMessage>{error}</FormMessage>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((a) => (
            <li
              key={a.ticket}
              className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm"
            >
              <span className="max-w-48 truncate">{a.name}</span>
              <span className="text-xs text-muted">{sizeLabel(a.size, lang)}</span>
              <button
                type="button"
                aria-label={t('tickets.removeFile', { name: a.name })}
                className="flex size-7 items-center justify-center rounded-full hover:bg-surface2"
                onClick={() => onChange(value.filter((x) => x.ticket !== a.ticket))}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label
          className={`inline-flex min-h-10 items-center gap-2 rounded-full border-[1.5px] border-gold px-4 text-[13px] font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${full ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-surface2'}`}
        >
          <input
            type="file"
            multiple
            className="sr-only"
            accept={Object.keys(LIMITS).join(',')}
            disabled={full}
            onChange={pick}
          />
          {busy ? <Spinner size={16} /> : <Icon name="upload" size={16} />}
          {t('tickets.attach')}
        </label>
        <span className="text-xs text-muted">{t('tickets.attachHint')}</span>
      </div>
    </div>
  );
}
