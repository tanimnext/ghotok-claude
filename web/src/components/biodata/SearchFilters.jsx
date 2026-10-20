'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BIODATA_TYPES,
  COMPLEXIONS,
  DIVISION_OPTIONS,
  ECONOMIC_STATUS,
  EDUCATION_LEVELS,
  HEIGHTS,
  MARITAL_STATUS,
  PROFESSIONS,
  RELIGIONS,
  districtsOf,
} from '@ghotok/shared';
import { Button, Checkbox, Icon } from '@ghotok/ui';
import { toQueryString } from '@/lib/search-params';
import { useT } from '@/providers/PreferencesProvider';

const list = (v) => (v ? String(v).split(',').filter(Boolean) : []);

function Group({ legend, children }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-2 text-[13px] font-bold uppercase tracking-[0.04em] text-muted">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Select({ label, value, onChange, options, any }) {
  return (
    <label className="flex flex-col gap-2 text-[13px] font-bold uppercase tracking-[0.04em] text-muted">
      {label}
      <select
        className="field-input text-[15px] font-normal normal-case tracking-normal"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The filter sidebar. Filters live in the URL; "Show results" navigates to the
 * new URL and the page re-renders on the server.
 */
export function SearchFilters({ initial }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ type: 'bride', ...initial });
  const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }));
  const toggle = (key, value) => {
    const values = new Set(list(f[key]));
    if (values.has(value)) values.delete(value);
    else values.add(value);
    set(key, [...values].join(','));
  };
  const opts = (options) => options.map((o) => ({ value: o.value, label: o[lang] }));

  const apply = (e) => {
    e?.preventDefault();
    const { page: _page, ...rest } = f;
    router.push(`/biodatas${toQueryString(rest)}`);
    setOpen(false);
  };

  const clear = () => {
    setF({ type: f.type });
    router.push(`/biodatas?type=${f.type}`);
  };

  return (
    <div className="w-full lg:w-[290px] lg:flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-line bg-surface font-bold lg:hidden"
      >
        <Icon name="filter" /> {t('browse.showFilters')}
      </button>
      <form
        onSubmit={apply}
        aria-label={t('browse.filters')}
        className={`${open ? 'flex' : 'hidden'} mt-4 flex-col gap-6 rounded-[28px] border border-line bg-surface p-6 lg:mt-0 lg:flex`}
      >
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold">{t('browse.filters')}</span>
          <button type="button" onClick={clear} className="p-1.5 text-sm font-bold text-rose-text">
            {t('browse.clear')}
          </button>
        </div>

        <Group legend={t('browse.lookingFor')}>
          <div className="grid grid-cols-2 gap-2.5">
            {BIODATA_TYPES.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={f.type === o.value}
                onClick={() => set('type', o.value)}
                className={`min-h-12 rounded-full text-sm font-bold ${f.type === o.value ? 'bg-rose text-on-rose' : 'border-[1.5px] border-line'}`}
              >
                {o[lang]}
              </button>
            ))}
          </div>
        </Group>

        <Group legend={t('browse.religion')}>
          {RELIGIONS.map((o) => (
            <Checkbox
              key={o.value}
              label={o[lang]}
              checked={list(f.religion).includes(o.value)}
              onChange={() => toggle('religion', o.value)}
            />
          ))}
        </Group>

        <Group legend={t('browse.marital')}>
          {MARITAL_STATUS.map((o) => (
            <Checkbox
              key={o.value}
              label={o[lang]}
              checked={list(f.marital).includes(o.value)}
              onChange={() => toggle('marital', o.value)}
            />
          ))}
        </Group>

        <Group legend={t('browse.ageRange')}>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              ['ageMin', 'browse.from'],
              ['ageMax', 'browse.to'],
            ].map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs text-muted">
                {t(label)}
                <input
                  type="number"
                  min="18"
                  max="80"
                  inputMode="numeric"
                  className="field-input"
                  value={f[key] ?? ''}
                  onChange={(e) => set(key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </Group>

        <Group legend={t('browse.height')}>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              ['heightMin', 'browse.from'],
              ['heightMax', 'browse.to'],
            ].map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs text-muted">
                {t(label)}
                <select
                  className="field-input"
                  value={f[key] ?? ''}
                  onChange={(e) => set(key, e.target.value)}
                >
                  <option value="">{t('common.any')}</option>
                  {HEIGHTS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h[lang]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </Group>

        <Select
          label={t('browse.division')}
          value={f.division}
          any={t('common.all')}
          options={opts(DIVISION_OPTIONS)}
          onChange={(v) => setF((p) => ({ ...p, division: v, district: '' }))}
        />
        <Select
          label={t('browse.district')}
          value={f.district}
          any={t('common.all')}
          options={opts(districtsOf(f.division))}
          onChange={(v) => set('district', v)}
        />
        <Select
          label={t('browse.education')}
          value={f.education}
          any={t('common.any')}
          options={opts(EDUCATION_LEVELS)}
          onChange={(v) => set('education', v)}
        />
        <Select
          label={t('browse.profession')}
          value={f.profession}
          any={t('common.any')}
          options={opts(PROFESSIONS)}
          onChange={(v) => set('profession', v)}
        />
        <Select
          label={t('browse.complexion')}
          value={f.complexion}
          any={t('common.any')}
          options={opts(COMPLEXIONS)}
          onChange={(v) => set('complexion', v)}
        />
        <Select
          label={t('browse.economic')}
          value={f.economic}
          any={t('common.any')}
          options={opts(ECONOMIC_STATUS)}
          onChange={(v) => set('economic', v)}
        />

        <Checkbox
          label={t('browse.nidOnly')}
          checked={f.nid === 'verified'}
          onChange={(e) => set('nid', e.target.checked ? 'verified' : '')}
        />

        <label className="flex flex-col gap-2 text-[13px] font-bold uppercase tracking-[0.04em] text-muted">
          {t('browse.biodataNo')}
          <input
            className="field-input text-[15px] font-normal normal-case"
            placeholder={t('browse.biodataNoPh')}
            value={f.q ?? ''}
            onChange={(e) => set('q', e.target.value)}
          />
        </label>

        <Button type="submit" size="lg" block>
          {t('browse.apply')}
        </Button>
      </form>
    </div>
  );
}
