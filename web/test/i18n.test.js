import { describe, expect, it } from 'vitest';
import bn from '../src/lib/i18n/bn.js';
import en from '../src/lib/i18n/en.js';
import { createTranslator } from '../src/lib/i18n/index.js';

/** Every key path in a dictionary, e.g. "home.steps.0.t". */
function keyPaths(node, prefix = '') {
  if (node === null || typeof node !== 'object') return [prefix];
  return Object.entries(node).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}

const placeholders = (s) =>
  typeof s === 'string' ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort() : [];

describe('dictionaries', () => {
  it('English and Bangla have exactly the same keys', () => {
    expect(keyPaths(bn).sort()).toEqual(keyPaths(en).sort());
  });

  it('use the same {placeholders} in both languages', () => {
    for (const path of keyPaths(en)) {
      const get = (d) => path.split('.').reduce((n, k) => n?.[k], d);
      expect(placeholders(get(bn)), path).toEqual(placeholders(get(en)));
    }
  });

  it('has no empty strings', () => {
    for (const dict of [en, bn]) {
      for (const path of keyPaths(dict)) {
        const value = path.split('.').reduce((n, k) => n?.[k], dict);
        expect(String(value).trim().length, path).toBeGreaterThan(0);
      }
    }
  });
});

describe('createTranslator', () => {
  it('fills placeholders and falls back to the key', () => {
    const t = createTranslator('en');
    expect(t('common.connections', { n: 5 })).toBe('5 connections');
    expect(t('does.not.exist')).toBe('does.not.exist');
    expect(createTranslator('bn')('nav.home')).toBe('হোম');
  });
});
