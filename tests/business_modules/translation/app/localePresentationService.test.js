import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'os';
import { normalizeLocale, parseLocale, isLocalizedLang } from '../../../../business_modules/translation/app/parseLocale.js';
import { extractForTranslation, applyTranslations, collectStringFields } from '../../../../business_modules/translation/app/localePathUtils.js';
import { fingerprintPayload, readLocaleCache, writeLocaleCache, resetLocaleCacheForTests, setLocaleCacheDirForTests } from '../../../../business_modules/translation/app/localeCache.js';
import { localizePayload } from '../../../../business_modules/translation/app/localePresentationService.js';

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

describe('isLocalizedLang', () => {
  it('detects he and ru', () => {
    assert.equal(isLocalizedLang('he'), true);
    assert.equal(isLocalizedLang('en'), false);
  });
});
