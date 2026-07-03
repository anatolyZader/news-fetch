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

describe('report.dataQualityCaveat i18n', () => {
  const translations = loadLocaleMaps();

  for (const lang of ['en', 'he', 'ru']) {
    it(`defines report.dataQualityCaveat for ${lang}`, () => {
      const key = translations[lang]?.['report.dataQualityCaveat'];
      assert.ok(key && String(key).trim().length > 0);
      assert.doesNotMatch(String(key), /^report\./);
    });
  }
});
