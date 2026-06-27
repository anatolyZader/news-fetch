import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectSourceLang, normalizeSourceLang, shouldSkipTranslation } from '../../../../business_modules/translation/app/detectSourceLang.js';

describe('detectSourceLang', () => {
  it('detects Hebrew from non-Latin text', () => {
    assert.equal(detectSourceLang('שלום עולם זה טקסט בעברית'), 'he');
  });

  it('detects English from Latin text', () => {
    assert.equal(detectSourceLang('Home front alert in northern Israel'), 'en');
  });

  it('normalizes heb to he', () => {
    assert.equal(normalizeSourceLang('heb'), 'he');
  });

  it('skips translation when source equals target', () => {
    assert.equal(shouldSkipTranslation('he', 'he'), true);
    assert.equal(shouldSkipTranslation('en', 'he'), false);
  });
});
