import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'os';
import {
  cacheKey,
  getTranslatedReport,
  resetTranslationStateForTests,
  setTranslationReportsDirForTests,
  socialTranslationCacheKey,
  translateSocialPosts,
} from '../../../../business_modules/translation/app/translationService.js';

const sampleReport = {
  date: '2026-06-01',
  report_scope: { id: 'national' },
  total_articles_analyzed: 42,
  cross_component_synthesis: 'Executive summary in English.',
  components: [
    { component_id: 'narrative', narrative: 'Narrative text.' },
    { component_id: 'leadership', narrative: 'Leadership text.' },
  ],
};

describe('translationService', () => {
  /** @type {string} */
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'translation-svc-'));
    setTranslationReportsDirForTests(tempDir);
  });

  afterEach(() => {
    resetTranslationStateForTests();
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.TRANSLATION_ENABLED;
  });

  it('cacheKey encodes date, scope, article count, and lang', () => {
    assert.equal(cacheKey(sampleReport, 'he'), '2026-06-01_national_42_he');
  });

  it('getTranslatedReport returns input unchanged for English', async () => {
    const out = await getTranslatedReport(sampleReport, 'en');
    assert.equal(out, sampleReport);
  });

  it('getTranslatedReport serves pre-written disk cache without LLM', async () => {
    const cached = {
      ...sampleReport,
      cross_component_synthesis: 'סיכום בעברית.',
      components: sampleReport.components.map((c) => ({ ...c, narrative: `[he] ${c.narrative}` })),
      _translation_meta: {
        schema: 'v3',
        fields: {
          cross_component_synthesis: true,
          components_narrative: true,
          components_evidence: true,
        },
      },
    };
    writeFileSync(
      join(tempDir, 'translation-v2-2026-06-01-42-he.json'),
      JSON.stringify(cached),
      'utf8',
    );

    const out = await getTranslatedReport(sampleReport, 'he');
    assert.equal(out.cross_component_synthesis, 'סיכום בעברית.');
    assert.equal(out.components[0].narrative, '[he] Narrative text.');
  });

  it('translateSocialPosts returns originals when translation is disabled', async () => {
    const posts = [{ id: 'p1', text: 'Hello world' }];
    const out = await translateSocialPosts(posts, 'he', { date: '2026-06-01', categoryId: 'shelter' });
    assert.deepEqual(out, posts);
  });

  it('translateSocialPosts reads disk cache when cache key is provided', async () => {
    process.env.TRANSLATION_ENABLED = 'true';
    const posts = [{ id: 'p1', text: 'Hello', textOriginal: 'Hello' }];
    const cacheKey = socialTranslationCacheKey(posts, 'he', {
      date: '2026-06-01',
      categoryId: 'shelter',
      bundleFingerprint: 'bundle-v1',
    });
    assert.ok(cacheKey);
    const cached = [{ ...posts[0], text: 'שלום', translatedTo: 'he' }];
    writeFileSync(
      join(tempDir, `social-translation-${cacheKey}.json`),
      JSON.stringify(cached),
      'utf8',
    );

    const out = await translateSocialPosts(posts, 'he', {
      date: '2026-06-01',
      categoryId: 'shelter',
      bundleFingerprint: 'bundle-v1',
    });
    assert.equal(out[0].text, 'שלום');
    assert.equal(out[0].translatedTo, 'he');
  });

  it('socialTranslationCacheKey returns null without date or category', () => {
    assert.equal(socialTranslationCacheKey([{ id: '1', text: 'x' }], 'he', {}), null);
  });
});
