import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGlossaryBlock,
  loadGlossaryTerms,
  resetGlossaryCacheForTests,
} from '../../../../business_modules/translation/app/translationGlossary.js';

describe('translationGlossary', () => {
  afterEach(() => {
    resetGlossaryCacheForTests();
  });

  it('loads glossary terms from JSON config', async () => {
    const terms = await loadGlossaryTerms();
    assert.ok(Array.isArray(terms));
    assert.ok(terms.length >= 8);
    assert.equal(typeof terms[0].en, 'string');
    assert.equal(typeof terms[0].he, 'string');
    assert.equal(typeof terms[0].ru, 'string');
  });

  it('buildGlossaryBlock includes component and key term sections for Hebrew', async () => {
    const terms = await loadGlossaryTerms();
    const block = buildGlossaryBlock(terms, 'he');
    assert.match(block, /Component name glossary/);
    assert.match(block, /Key term glossary/);
    assert.match(block, /Narrative → נרטיב/);
    assert.match(block, /Home Front Command → פיקוד העורף/);
  });

  it('buildGlossaryBlock includes Russian headings', async () => {
    const terms = await loadGlossaryTerms();
    const block = buildGlossaryBlock(terms, 'ru');
    assert.match(block, /Глоссарий названий компонентов/);
    assert.match(block, /Narrative → Нарратив/);
  });
});
