import { createTranslator as createSharedTranslator } from '@ghotok/shared';
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

/** `t(key, vars)` for a language; missing Bangla text falls back to English. */
export function createTranslator(lang) {
  return createSharedTranslator(dictionaries[resolveLang(lang)], en);
}
