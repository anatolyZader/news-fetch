import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGlossaryBlock,
  filterTermsForSource,
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

  it('covers domain vocabulary: military, emergency services, community', async () => {
    const terms = await loadGlossaryTerms();
    const ids = new Set(terms.map((t) => t.id));
    for (const id of ['ceasefire', 'interception', 'mda', 'fire_rescue', 'tzachi', 'resilience_center', 'red_alert']) {
      assert.ok(ids.has(id), `missing glossary term: ${id}`);
    }
  });

  it('buildGlossaryBlock groups key terms under category headings', async () => {
    const terms = await loadGlossaryTerms();
    const he = buildGlossaryBlock(terms, 'he');
    assert.match(he, /Military & security:/);
    assert.match(he, /Emergency services:/);
    assert.match(he, /ceasefire → הפסקת אש/);
    const ru = buildGlossaryBlock(terms, 'ru');
    assert.match(ru, /Экстренные службы:/);
    assert.match(ru, /ceasefire → прекращение огня/);
  });

  it('filterTermsForSource keeps components always and key terms only when present in source', async () => {
    const terms = await loadGlossaryTerms();
    const filtered = filterTermsForSource(terms, 'Residents reported a ceasefire announcement near the shelter.');
    const ids = new Set(filtered.map((t) => t.id));
    assert.ok(ids.has('narrative_component'));
    assert.ok(ids.has('leadership'));
    assert.ok(ids.has('ceasefire'));
    assert.ok(ids.has('shelter'));
    assert.ok(!ids.has('earthquake'));
    assert.ok(!ids.has('mda'));
  });

  it('filterTermsForSource matches Hebrew aliases in mixed-language source', async () => {
    const terms = await loadGlossaryTerms();
    const filtered = filterTermsForSource(terms, 'תושבים שהו במקלט במהלך האירוע');
    assert.ok(filtered.some((t) => t.id === 'shelter'));
  });

  it('filterTermsForSource without source text keeps everything', async () => {
    const terms = await loadGlossaryTerms();
    assert.equal(filterTermsForSource(terms, undefined).length, terms.length);
    assert.equal(filterTermsForSource(terms, '').length, terms.length);
  });
});
