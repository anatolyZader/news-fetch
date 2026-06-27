#!/usr/bin/env node
/**
 * Vitest-free parity test wrapper — also invoked by npm run i18n:parity in CI.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const localesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../client/src/i18n/locales');

function loadLocaleMaps() {
  const translations = { en: {}, he: {}, ru: {} };
  for (const loc of ['en', 'he', 'ru']) {
    const dir = join(localesRoot, loc);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      Object.assign(translations[loc], data);
    }
  }
  return translations;
}

describe('translations locale parity', () => {
  it('he and ru contain every en key', () => {
    const translations = loadLocaleMaps();
    const enKeys = Object.keys(translations.en ?? {});
    const heMissing = enKeys.filter((k) => !translations.he?.[k]);
    const ruMissing = enKeys.filter((k) => !translations.ru?.[k]);
    assert.deepEqual(heMissing, [], `he missing keys: ${heMissing.slice(0, 10).join(', ')}`);
    assert.deepEqual(ruMissing, [], `ru missing keys: ${ruMissing.slice(0, 10).join(', ')}`);
  });
});
