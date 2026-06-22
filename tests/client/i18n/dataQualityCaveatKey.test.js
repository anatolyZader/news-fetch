import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../../../client/src/i18n/translations.js';

describe('report.dataQualityCaveat i18n', () => {
  for (const lang of ['en', 'he', 'ru']) {
    it(`defines report.dataQualityCaveat for ${lang}`, () => {
      const key = translations[lang]?.['report.dataQualityCaveat'];
      assert.ok(key && String(key).trim().length > 0);
      assert.doesNotMatch(String(key), /^report\./);
    });
  }
});
