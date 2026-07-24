import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'os';
import { normalizeLocale, parseLocale, isLocalizedLang } from '../../../../business_modules/translation/app/parseLocale.js';
import { extractForTranslation, applyTranslations, collectStringFields } from '../../../../business_modules/translation/app/localePathUtils.js';
import { fingerprintPayload, readLocaleCache, writeLocaleCache, resetLocaleCacheForTests, setLocaleCacheDirForTests } from '../../../../business_modules/translation/app/localeCache.js';
import { localizePayload } from '../../../../business_modules/translation/app/localePresentationService.js';
import { localizeReportTodayPayload } from '../../../../business_modules/translation/app/localizeReportToday.js';
import { setSharedLlmPort } from '../../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import {
  resetTranslationStateForTests,
  setTranslationReportsDirForTests,
} from '../../../../business_modules/translation/app/translationService.js';

/** Fake LLM port: echoes the request JSON with string values prefixed `TR:`. */
function makeFakePort({ error } = {}) {
  const calls = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => [k, k === 'id' ? v : walk(v)]),
      );
    }
    return typeof node === 'string' && node.trim() ? `TR:${node}` : node;
  };
  const port = {
    createMessage: async (opts) => {
      calls.push(opts);
      if (error) throw error;
      const body = String(opts.messages?.[0]?.content ?? '');
      const payload = JSON.parse(body.slice(body.indexOf('\n\n') + 2));
      return {
        stop_reason: 'end_turn',
        content: [{ text: JSON.stringify(walk(payload)) }],
        usage: { input_tokens: 10, output_tokens: 10 },
      };
    },
  };
  return { port, calls };
}

describe('parseLocale', () => {
  it('normalizes supported locales', () => {
    assert.equal(normalizeLocale('he'), 'he');
    assert.equal(normalizeLocale('RU'), 'ru');
    assert.equal(normalizeLocale('fr'), 'en');
  });

  it('reads lang from query', () => {
    assert.equal(parseLocale({ query: { lang: 'he' } }), 'he');
    assert.equal(parseLocale({ query: {} }), 'en');
  });
});

describe('localePathUtils', () => {
  it('collects array field paths', () => {
    const hits = collectStringFields(
      { articles: [{ title: 'Hello', body: 'World' }] },
      'articles[].title',
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].path, 'articles.0.title');
    assert.equal(hits[0].value, 'Hello');
  });

  it('extracts sourceLang from parent article', () => {
    const root = { articles: [{ title: 'שלום', body: 'עולם', sourceLang: 'he' }] };
    const { entries } = extractForTranslation(root, {
      fields: [{ path: 'articles[].title' }],
    });
    assert.equal(entries[0].sourceLang, 'he');
  });

  it('applyTranslations preserves originals', () => {
    const root = { articles: [{ title: 'Hello' }] };
    const { entries, pathMeta } = extractForTranslation(root, {
      fields: [{ path: 'articles[].title', originalKey: 'titleOriginal' }],
    });
    const result = applyTranslations(root, entries, pathMeta, { f0: 'שלום' });
    assert.equal(result.articles[0].title, 'שלום');
    assert.equal(result.articles[0].titleOriginal, 'Hello');
  });
});

describe('localeCache', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'locale-cache-'));
    setLocaleCacheDirForTests(dir);
  });

  afterEach(() => {
    resetLocaleCacheForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips disk cache', async () => {
    const fp = fingerprintPayload('news.daily', { x: 1 });
    await writeLocaleCache('news.daily', fp, 'he', { localized: true });
    const hit = await readLocaleCache('news.daily', fp, 'he');
    assert.deepEqual(hit, { localized: true });
  });
});

describe('localizePayload', () => {
  it('returns payload unchanged for en', async () => {
    const payload = { articles: [{ title: 'Hi' }] };
    const out = await localizePayload(payload, 'news.daily', 'en');
    assert.equal(out, payload);
  });

  it('returns payload when translation disabled', async () => {
    delete process.env.TRANSLATION_ENABLED;
    const payload = { articles: [{ title: 'Hi' }] };
    const out = await localizePayload(payload, 'news.daily', 'he');
    assert.equal(out, payload);
  });
});

describe('localizePayload with LLM port', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'locale-llm-'));
    setLocaleCacheDirForTests(dir);
    process.env.TRANSLATION_ENABLED = 'true';
  });

  afterEach(() => {
    setSharedLlmPort(null);
    resetLocaleCacheForTests();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TRANSLATION_ENABLED;
  });

  it('translates entries, tags calls with feature=translation, and caches', async () => {
    const { port, calls } = makeFakePort();
    setSharedLlmPort(port);
    const payload = { articles: [{ title: 'Hello', body: 'World' }] };
    const out = await localizePayload(payload, 'news.daily', 'he');
    assert.equal(out.articles[0].title, 'TR:Hello');
    assert.equal(out.articles[0].titleOriginal, 'Hello');
    assert.equal(calls[0].callContext.feature, 'translation');
    const fp = fingerprintPayload('news.daily', payload, '');
    assert.ok(await readLocaleCache('news.daily', fp, 'he'));
  });

  it('keeps source for oversized entries and skips the cache write', async () => {
    const { port, calls } = makeFakePort();
    setSharedLlmPort(port);
    const huge = 'x'.repeat(20001);
    const payload = { articles: [{ title: 'Hello', body: huge }] };
    const out = await localizePayload(payload, 'news.daily', 'he');
    assert.equal(out.articles[0].title, 'TR:Hello');
    assert.equal(out.articles[0].body, huge);
    assert.equal(calls.length, 1);
    assert.ok(!calls[0].messages[0].content.includes(huge));
    const fp = fingerprintPayload('news.daily', payload, '');
    assert.equal(await readLocaleCache('news.daily', fp, 'he'), null);
  });

  it('falls back to source on chunk failure without caching', async () => {
    const { port } = makeFakePort({ error: new Error('boom') });
    setSharedLlmPort(port);
    const payload = { articles: [{ title: 'Hello', body: 'World' }] };
    const out = await localizePayload(payload, 'news.daily', 'he');
    assert.equal(out.articles[0].title, 'Hello');
    const fp = fingerprintPayload('news.daily', payload, '');
    assert.equal(await readLocaleCache('news.daily', fp, 'he'), null);
  });
});

describe('localizeReportTodayPayload wrapper gate', () => {
  let dir;
  let reportsDir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'locale-wrapper-'));
    reportsDir = mkdtempSync(join(tmpdir(), 'translation-reports-'));
    setLocaleCacheDirForTests(dir);
    setTranslationReportsDirForTests(reportsDir);
    process.env.TRANSLATION_ENABLED = 'true';
  });

  afterEach(() => {
    setSharedLlmPort(null);
    resetLocaleCacheForTests();
    resetTranslationStateForTests();
    rmSync(dir, { recursive: true, force: true });
    rmSync(reportsDir, { recursive: true, force: true });
    delete process.env.TRANSLATION_ENABLED;
  });

  it('does not translate markdown for structured reports', async () => {
    const { port, calls } = makeFakePort();
    setSharedLlmPort(port);
    const payload = { found: true, markdown: 'English report body', reportDate: '2026-04-01' };
    const out = await localizeReportTodayPayload(payload, 'he');
    assert.equal(out.markdown, 'English report body');
    assert.equal(calls.length, 0);
  });

  it('still translates markdown for markdown-only reports', async () => {
    const { port } = makeFakePort();
    setSharedLlmPort(port);
    const payload = {
      found: true,
      assessment: {
        date: '2026-04-01',
        report_scope: { id: 'north' },
        total_articles_analyzed: 0,
        components: [],
        cross_component_synthesis: 'Summary.',
        markdown_only: true,
      },
      markdown: 'Archive body',
      reportDate: '2026-04-01',
    };
    const out = await localizeReportTodayPayload(payload, 'he');
    assert.equal(out.markdown, 'TR:Archive body');
  });
});

describe('isLocalizedLang', () => {
  it('detects he and ru', () => {
    assert.equal(isLocalizedLang('he'), true);
    assert.equal(isLocalizedLang('en'), false);
  });
});
