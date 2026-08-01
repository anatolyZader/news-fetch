import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mergeGlossaryOverrides,
  loadMergedGlossaryTerms,
} from '../../../cross-cut-modules/config/translationGlossarySource.js';

const BASE = [
  { id: 'ceasefire', en: 'ceasefire', he: 'הפסקת אש', ru: 'прекращение огня', category: 'military', aliases: ['ceasefire'] },
  { id: 'shelter', en: 'shelter', he: 'מקלט', ru: 'укрытие', category: 'civil_defense' },
];

describe('translationGlossarySource', () => {
  it('override replaces only the fields it carries', () => {
    const { terms, warnings } = mergeGlossaryOverrides(BASE, [{ id: 'ceasefire', ru: 'перемирие' }]);
    const t = terms.find((x) => x.id === 'ceasefire');
    assert.equal(t.ru, 'перемирие');
    assert.equal(t.he, 'הפסקת אש');
    assert.deepEqual(t.aliases, ['ceasefire']);
    assert.equal(warnings.length, 0);
  });

  it('remove:true drops a base term', () => {
    const { terms } = mergeGlossaryOverrides(BASE, [{ id: 'shelter', remove: true }]);
    assert.ok(!terms.some((t) => t.id === 'shelter'));
    assert.equal(terms.length, BASE.length - 1);
  });

  it('new id with full en/he/ru is appended', () => {
    const { terms, warnings } = mergeGlossaryOverrides(BASE, [
      { id: 'zaka', en: 'ZAKA', he: 'זק"א', ru: 'ЗАКА', category: 'emergency_services' },
    ]);
    assert.equal(terms.at(-1).id, 'zaka');
    assert.equal(warnings.length, 0);
  });

  it('incomplete new term and unknown removals are skipped with warnings', () => {
    const { terms, warnings } = mergeGlossaryOverrides(BASE, [
      { id: 'partial', en: 'only english' },
      { id: 'ghost', remove: true },
      { en: 'no id at all' },
    ]);
    assert.equal(terms.length, BASE.length);
    assert.equal(warnings.length, 3);
  });

  describe('loadMergedGlossaryTerms', () => {
    let dir;
    before(async () => {
      dir = await mkdtemp(join(tmpdir(), 'glossary-test-'));
      await writeFile(join(dir, 'base.json'), JSON.stringify(BASE));
      await writeFile(join(dir, 'overrides.json'), JSON.stringify([{ id: 'ceasefire', he: 'שביתת נשק' }]));
    });
    after(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('merges override files over the base file', async () => {
      const { terms } = await loadMergedGlossaryTerms({
        basePath: join(dir, 'base.json'),
        overridesPath: join(dir, 'overrides.json'),
      });
      assert.equal(terms.find((t) => t.id === 'ceasefire').he, 'שביתת נשק');
    });

    it('missing overrides file falls back to base as-is', async () => {
      const { terms } = await loadMergedGlossaryTerms({
        basePath: join(dir, 'base.json'),
        overridesPath: join(dir, 'nope.json'),
      });
      assert.equal(terms.length, BASE.length);
    });

    it('default repo files load and merge without error', async () => {
      const { terms } = await loadMergedGlossaryTerms();
      assert.ok(terms.some((t) => t.id === 'hfc'));
    });
  });
});
