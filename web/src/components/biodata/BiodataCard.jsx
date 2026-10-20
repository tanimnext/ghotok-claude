'use client';

import Link from 'next/link';
import { Icon, Pill } from '@/components/ui';
import { useT } from '@/providers/PreferencesProvider';
import { ArchPortrait } from './ArchPortrait.jsx';
import { cardText } from './biodata-text.js';

/**
 * A biodata summary card (home page, search results, personal lists).
 * `footer` replaces the default "View biodata" link, e.g. with list actions.
 */
export function BiodataCard({ biodata, footer }) {
  const { t, lang } = useT();
  const text = cardText(biodata, t, lang);
  const href = `/biodatas/${biodata.biodataNo}`;
  return (
    <article className="relative flex flex-col gap-4 rounded-[28px] border border-line bg-surface p-5 pb-6 transition hover:border-gold">
      <ArchPortrait photoUrl={biodata.photoUrl} alt={text.id}>
        {biodata.nidVerified && (
          <span className="absolute left-1/2 top-3.5 -translate-x-1/2">
            <Pill tone="sage">
              <Icon name="shield" size={13} strokeWidth={2.4} />
              {t('card.verified')}
            </Pill>
          </span>
        )}
      </ArchPortrait>
      <div className="flex flex-col gap-1.5 px-1.5">
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{text.id}</span>
        <h3 className="font-display text-[23px] font-semibold leading-snug">
          <Link href={href} className="after:absolute after:inset-0 hover:text-rose-text">
            {text.title || biodata.biodataNo}
          </Link>
        </h3>
        <p className="text-[15px] leading-relaxed text-muted">
          {text.education && <span className="block">{text.education}</span>}
          {text.job && <span className="block">{text.job}</span>}
          {text.place && <span className="block">{text.place}</span>}
        </p>
      </div>
      <div className="relative z-10 mt-auto px-1.5">
        {footer ?? (
          <Link href={href} className="inline-flex items-center gap-1.5 text-[15px] font-bold text-rose-text">
            {t('card.viewBio')} <Icon name="arrowRight" size={16} />
          </Link>
        )}
      </div>
    </article>
  );
}
