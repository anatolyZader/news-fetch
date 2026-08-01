import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createUrlReputationChecker,
  safeBrowsingApiKey,
} from '../../../cross-cut-modules/security/infrastructure/urlReputation.js';

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

function recordingFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, impl };
}

describe('safeBrowsingApiKey', () => {
  it('trims the env value and defaults to empty', () => {
    assert.equal(safeBrowsingApiKey({ SAFE_BROWSING_API_KEY: '  key-1  ' }), 'key-1');
    assert.equal(safeBrowsingApiKey({}), '');
  });
});

describe('createUrlReputationChecker', () => {
  it('is disabled without a key: never fetches, returns unchecked, warns once', async () => {
    const { calls, impl } = recordingFetch([]);
    const warnings = [];
    const checker = createUrlReputationChecker({
      apiKey: '',
      fetchImpl: impl,
      warn: (msg) => warnings.push(msg),
    });
    assert.equal(checker.enabled, false);
    const first = await checker.checkUrls(['https://a.example/x']);
    const second = await checker.checkUrls(['https://b.example/y']);
    assert.deepEqual(first.get('https://a.example/x'), { status: 'unchecked' });
    assert.deepEqual(second.get('https://b.example/y'), { status: 'unchecked' });
    assert.equal(calls.length, 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /SAFE_BROWSING_API_KEY not set/);
  });

  it('marks matched URLs flagged with the threat type and siblings ok', async () => {
    const { calls, impl } = recordingFetch([
      jsonResponse({
        matches: [
          { threatType: 'SOCIAL_ENGINEERING', threat: { url: 'http://bad.example/login' } },
        ],
      }),
    ]);
    const checker = createUrlReputationChecker({ apiKey: 'k', fetchImpl: impl, warn: () => {} });
    assert.equal(checker.enabled, true);
    const results = await checker.checkUrls(['http://bad.example/login', 'https://good.example/']);
    assert.deepEqual(results.get('http://bad.example/login'), {
      status: 'flagged',
      threatType: 'SOCIAL_ENGINEERING',
    });
    assert.deepEqual(results.get('https://good.example/'), { status: 'ok' });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^https:\/\/safebrowsing\.googleapis\.com\/v4\/threatMatches:find\?key=k$/);
    assert.deepEqual(calls[0].body.threatInfo.threatEntries, [
      { url: 'http://bad.example/login' },
      { url: 'https://good.example/' },
    ]);
  });

  it('dedupes input URLs before requesting', async () => {
    const { calls, impl } = recordingFetch([jsonResponse({})]);
    const checker = createUrlReputationChecker({ apiKey: 'k', fetchImpl: impl, warn: () => {} });
    const results = await checker.checkUrls(['https://a.example/', 'https://a.example/']);
    assert.equal(results.size, 1);
    assert.equal(calls[0].body.threatInfo.threatEntries.length, 1);
  });

  it('chunks requests at 500 entries', async () => {
    const { calls, impl } = recordingFetch([jsonResponse({}), jsonResponse({})]);
    const checker = createUrlReputationChecker({ apiKey: 'k', fetchImpl: impl, warn: () => {} });
    const urls = Array.from({ length: 501 }, (_, i) => `https://example.com/${i}`);
    const results = await checker.checkUrls(urls);
    assert.equal(results.size, 501);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.threatInfo.threatEntries.length, 500);
    assert.equal(calls[1].body.threatInfo.threatEntries.length, 1);
  });

  it('fails open on a thrown fetch error', async () => {
    const { impl } = recordingFetch([new Error('network down')]);
    const warnings = [];
    const checker = createUrlReputationChecker({
      apiKey: 'k',
      fetchImpl: impl,
      warn: (msg) => warnings.push(msg),
    });
    const results = await checker.checkUrls(['https://a.example/']);
    assert.deepEqual(results.get('https://a.example/'), { status: 'unchecked' });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /fail-open/);
  });

  it('fails open on a non-2xx response', async () => {
    const { impl } = recordingFetch([jsonResponse({}, { ok: false, status: 500 })]);
    const warnings = [];
    const checker = createUrlReputationChecker({
      apiKey: 'k',
      fetchImpl: impl,
      warn: (msg) => warnings.push(msg),
    });
    const results = await checker.checkUrls(['https://a.example/']);
    assert.deepEqual(results.get('https://a.example/'), { status: 'unchecked' });
    assert.match(warnings[0], /HTTP 500/);
  });
});
