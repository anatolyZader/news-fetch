#!/usr/bin/env node
/**
 * Vitest-free parity test wrapper — also invoked by npm run i18n:parity in CI.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const translationsPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../client/src/i18n/translations.js');

describe('translations.js locale parity', () => {
  it('he and ru contain every en key', async () => {
    const { translations } = await import(translationsPath);
    const enKeys = Object.keys(translations.en ?? {});
    const heMissing = enKeys.filter((k) => !translations.he?.[k]);
    const ruMissing = enKeys.filter((k) => !translations.ru?.[k]);
    assert.deepEqual(heMissing, [], `he missing keys: ${heMissing.slice(0, 10).join(', ')}`);
    assert.deepEqual(ruMissing, [], `ru missing keys: ${ruMissing.slice(0, 10).join(', ')}`);
  });
});
