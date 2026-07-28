import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'os';
import {
  cacheKey,
  getTranslatedReport,
  isInTargetScript,
  resetTranslationStateForTests,
  setTranslationReportsDirForTests,
  socialTranslationCacheKey,
  translateSocialPosts,
} from '../../../../business_modules/translation/app/translationService.js';
import { setSharedLlmPort } from '../../../../cross-cut-modules/llm/anthropicLlmAdapter.js';

const HE_PROSE = 'תרגום פרוזה ארוך מאוד בעברית עבור בדיקות אוטומטיות של שירות התרגום';
const HE_ROW = 'תרגום עברי ממושך ומספק עבור שורת ראיות';

/**
 * Fake LLM port: prose calls return HE_PROSE; strings calls translate each row
 * (optionally dropping ids listed in dropOnCall for the Nth strings call).
 */
function reportFakePort({ rowTexts = [], userContents = [], dropOnCall = {} } = {}) {
  let stringsCall = 0;
  return {
    transport: 'claude-cli',
    createMessage: async (req) => {
      const content = req.messages[0].content;
      userContents.push(content);
      if (content.includes('Return ONLY the translated text')) {
        return {
          content: [{ type: 'text', text: HE_PROSE }],
          usage: { input_tokens: 10, output_tokens: 10 },
          stop_reason: 'end_turn',
        };
      }
      stringsCall += 1;
      const payload = JSON.parse(content.slice(content.indexOf('\n\n') + 2));
      const drop = new Set(dropOnCall[stringsCall] ?? []);
      const rows = payload.strings ?? [];
      rows.forEach((r) => rowTexts.push(r.text));
      const strings = rows
        .filter((r) => !drop.has(r.text))
        .map((r) => ({ id: r.id, text: `${HE_ROW} ${r.id}` }));
      return {
        content: [{ type: 'text', text: JSON.stringify({ strings }) }],
        usage: { input_tokens: 10, output_tokens: 10 },
        stop_reason: 'end_turn',
      };
    },
  };
}

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

  /** @type {string | undefined} */
  let prevCostLogPath;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'translation-svc-'));
    setTranslationReportsDirForTests(tempDir);
    prevCostLogPath = process.env.COST_LOG_PATH;
    process.env.COST_LOG_PATH = join(tempDir, 'cost-log.jsonl');
  });

  afterEach(() => {
    resetTranslationStateForTests();
    setSharedLlmPort(null);
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.TRANSLATION_ENABLED;
    if (prevCostLogPath == null) delete process.env.COST_LOG_PATH;
    else process.env.COST_LOG_PATH = prevCostLogPath;
  });

  it('cacheKey encodes date, scope, article count, and lang', () => {
    assert.equal(cacheKey(sampleReport, 'he'), '2026-06-01_national_42_he');
  });

  it('getTranslatedReport returns input unchanged for English', async () => {
    const out = await getTranslatedReport(sampleReport, 'en');
    assert.equal(out, sampleReport);
  });

  it('getTranslatedReport serves pre-written disk cache without LLM', async () => {
    process.env.TRANSLATION_ENABLED = 'true';
    const cached = {
      ...sampleReport,
      cross_component_synthesis: 'סיכום בעברית.',
      components: sampleReport.components.map((c) => ({ ...c, narrative: `[he] ${c.narrative}` })),
      _translation_meta: {
        schema: 'v7',
        fields: {
          cross_component_synthesis: true,
          components_narrative: true,
          components_evidence: true,
          evidence_operator_structured: true,
          operator_investigation_pool: true,
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

  it('isInTargetScript judges script dominance and exempts short strings', () => {
    assert.equal(isInTargetScript(HE_PROSE, 'he'), true);
    assert.equal(isInTargetScript('This is clearly English evidence text.', 'he'), false);
    assert.equal(isInTargetScript('This is clearly English evidence text.', 'ru'), false);
    assert.equal(isInTargetScript('ynet.co.il', 'he'), true); // too short to judge
  });

  it('rejects a stale v6 disk cache and re-translates', async () => {
    process.env.TRANSLATION_ENABLED = 'true';
    const staleCached = {
      ...sampleReport,
      cross_component_synthesis: 'old cached English synthesis.',
      _translation_meta: {
        schema: 'v6',
        fields: { cross_component_synthesis: true, components_narrative: true, components_evidence: true },
      },
    };
    writeFileSync(join(tempDir, 'translation-v2-2026-06-01-42-he.json'), JSON.stringify(staleCached), 'utf8');
    setSharedLlmPort(reportFakePort());

    const out = await getTranslatedReport(sampleReport, 'he');
    assert.equal(out.cross_component_synthesis, HE_PROSE);
  });

  const richReport = {
    date: '2026-06-02',
    report_scope: { id: 'north' },
    total_articles_analyzed: 7,
    cross_component_synthesis: 'Synthesis in English.',
    components: [
      {
        component_id: 'narrative',
        narrative: 'Plain narrative in English.',
        narrative_operator: 'Operator narrative in English.',
        interpretive_summary: 'Interpretive summary in English text.',
        evidence_operator_structured: [
          {
            ref: 'sig@idx:0',
            evidence: 'Shared evidence line in English.',
            text: 'Shared evidence line in English.',
            url: 'https://example.com/a',
            signal_type: 'coping',
            routing_role: 'primary',
          },
        ],
        operator_investigation_pool: [
          { ref: 'sig@idx:0', evidence: 'Shared evidence line in English.', url: 'https://example.com/a' },
          { ref: 'sig@idx:1', evidence: 'Pool-only evidence line in English.', url: null },
          { ref: 'sig@idx:2', evidence: 'עדות בעברית שנאספה בביקור שטח ביישוב מסוים', url: null },
        ],
        operator_investigation_pool_by_source: [
          {
            key: 'press',
            items: [
              { ref: 'sig@idx:1', evidence: 'Pool-only evidence line in English.', url: null },
            ],
          },
        ],
      },
    ],
  };

  it('translates pool + by_source items, dedupes shared strings, and skips target-lang rows', async () => {
    process.env.TRANSLATION_ENABLED = 'true';
    const rowTexts = [];
    setSharedLlmPort(reportFakePort({ rowTexts }));

    const out = await getTranslatedReport(richReport, 'he');
    const comp = out.components[0];

    // prose: operator variant gets the translation, plain narrative preserved
    assert.equal(comp.narrative_operator, HE_PROSE);
    assert.equal(comp.narrative, 'Plain narrative in English.');
    assert.equal(out.cross_component_synthesis, HE_PROSE);

    // evidence rows translated everywhere, original preserved
    assert.ok(comp.evidence_operator_structured[0].text.startsWith(HE_ROW));
    assert.equal(comp.evidence_operator_structured[0].textOriginal, 'Shared evidence line in English.');
    assert.ok(comp.evidence_operator_structured[0].markdown.includes('[source](https://example.com/a)'));
    assert.ok(comp.operator_investigation_pool[0].text.startsWith(HE_ROW));
    assert.equal(comp.operator_investigation_pool[0].evidence, 'Shared evidence line in English.');
    assert.ok(comp.operator_investigation_pool_by_source[0].items[0].text.startsWith(HE_ROW));
    assert.ok(comp.interpretive_summary.startsWith(HE_ROW));

    // dedupe: the shared string went out exactly once
    assert.equal(rowTexts.filter((t) => t === 'Shared evidence line in English.').length, 1);
    // Hebrew source row for a Hebrew target is never sent, and stays as-is
    assert.equal(rowTexts.filter((t) => t.includes('עדות בעברית')).length, 0);
    assert.equal(comp.operator_investigation_pool[2].text, 'עדות בעברית שנאספה בביקור שטח ביישוב מסוים');

    // v7 meta with coverage and pool flag
    const cachedRaw = JSON.parse(readFileSync(join(tempDir, 'translation-v2-north-2026-06-02-7-he.json'), 'utf8'));
    assert.equal(cachedRaw._translation_meta.schema, 'v7');
    assert.equal(cachedRaw._translation_meta.fields.operator_investigation_pool, true);
    assert.equal(cachedRaw._translation_meta.coverage.failed, 0);
    assert.ok(cachedRaw._translation_meta.coverage.translated > 0);
  });

  it('repairs rows dropped by the model in a follow-up call and records coverage', async () => {
    process.env.TRANSLATION_ENABLED = 'true';
    const rowTexts = [];
    setSharedLlmPort(reportFakePort({
      rowTexts,
      dropOnCall: { 1: ['Pool-only evidence line in English.'] },
    }));

    const out = await getTranslatedReport(richReport, 'he');
    const comp = out.components[0];
    assert.ok(comp.operator_investigation_pool[1].text.startsWith(HE_ROW));

    // dropped row was re-sent exactly once more
    assert.equal(rowTexts.filter((t) => t === 'Pool-only evidence line in English.').length, 2);
    const cachedRaw = JSON.parse(readFileSync(join(tempDir, 'translation-v2-north-2026-06-02-7-he.json'), 'utf8'));
    assert.equal(cachedRaw._translation_meta.coverage.repaired, 1);
    assert.equal(cachedRaw._translation_meta.coverage.failed, 0);
  });

  it('does not cache a mostly-failed translation', async () => {
    process.env.TRANSLATION_ENABLED = 'true';
    setSharedLlmPort({
      transport: 'claude-cli',
      createMessage: async () => { throw new Error('transport down'); },
    });

    const out = await getTranslatedReport(richReport, 'he');
    // source text preserved, nothing cached
    assert.equal(out.components[0].narrative_operator, 'Operator narrative in English.');
    assert.equal(existsSync(join(tempDir, 'translation-v2-north-2026-06-02-7-he.json')), false);
  });

  it('declares mixed sources when Hebrew rows go to a Russian target', async () => {
    process.env.TRANSLATION_ENABLED = 'true';
    const userContents = [];
    setSharedLlmPort({
      transport: 'claude-cli',
      createMessage: async (req) => {
        const content = req.messages[0].content;
        userContents.push(content);
        if (content.includes('Return ONLY the translated text')) {
          return {
            content: [{ type: 'text', text: 'Достаточно длинный русский перевод для автоматической проверки' }],
            usage: { input_tokens: 10, output_tokens: 10 },
            stop_reason: 'end_turn',
          };
        }
        const payload = JSON.parse(content.slice(content.indexOf('\n\n') + 2));
        const strings = (payload.strings ?? []).map((r) => (
          { id: r.id, text: `Русский перевод строки доказательств номер ${r.id}` }
        ));
        return {
          content: [{ type: 'text', text: JSON.stringify({ strings }) }],
          usage: { input_tokens: 10, output_tokens: 10 },
          stop_reason: 'end_turn',
        };
      },
    });

    const out = await getTranslatedReport(richReport, 'ru');
    const comp = out.components[0];
    // the Hebrew field-visit row IS translated for a Russian target
    assert.ok(comp.operator_investigation_pool[2].text.startsWith('Русский перевод'));
    const stringsCalls = userContents.filter((c) => c.includes('"strings"'));
    assert.ok(stringsCalls.some((c) => c.includes('Values may be in English or Hebrew')));
  });
});
