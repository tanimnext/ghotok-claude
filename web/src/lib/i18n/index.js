import bn from './bn.js';
import en from './en.js';

/**
 * Interface text lives in en.js and bn.js, which must have the same keys
 * (checked by web/test/i18n.test.js). Option labels for biodata fields come
 * from @ghotok/shared instead, because the API and admin panel use them too.
 */
export const LANGUAGES = ['en', 'bn'];
export const DEFAULT_LANG = process.env.NEXT_PUBLIC_DEFAULT_LANG === 'bn' ? 'bn' : 'en';
export const dictionaries = { en, bn };

export function resolveLang(value) {
  return LANGUAGES.includes(value) ? value : DEFAULT_LANG;
}

const lookup = (dict, key) => key.split('.').reduce((node, part) => node?.[part], dict);

/**
 * Returns `t(key, vars)` for a language. Missing Bangla text falls back to English,
 * then to the key itself. `{name}` placeholders are filled from `vars`.
 */
export function createTranslator(lang) {
  const dict = dictionaries[resolveLang(lang)];
  return function t(key, vars) {
    const value = lookup(dict, key) ?? lookup(en, key) ?? key;
    if (typeof value !== 'string' || !vars) return value;
    return value.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? '').toString());
  };
}
