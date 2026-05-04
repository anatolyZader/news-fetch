import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { maybeRescueEvidenceWithEmbedding } from '../../../../business_modules/resilience/infrastructure/embeddingEvidenceVerifier.js';

describe('maybeRescueEvidenceWithEmbedding', () => {
  const prevKey = process.env.OPENAI_API_KEY;
  const prevEmb = process.env.RESILIENCE_EMBEDDING_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.RESILIENCE_EMBEDDING_API_KEY;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
    if (prevEmb === undefined) delete process.env.RESILIENCE_EMBEDDING_API_KEY;
    else process.env.RESILIENCE_EMBEDDING_API_KEY = prevEmb;
    delete globalThis.fetch;
  });

  it('skips when no API key', async () => {
    const r = await maybeRescueEvidenceWithEmbedding(
      { evidence_type: 'observational_reported_fact', evidence: 'hello world test phrase' },
      'body hello world test phrase extended',
      { ok: false, sim: 0.32 },
    );
    assert.equal(r.skipped, true);
    assert.equal(r.ok, false);
  });

  it('rescues borderline failure when cosine is high', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.RESILIENCE_EMBED_BORDERLINE_LOW = '0.25';
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        data: [{ embedding: [1, 0, 0] }],
      }),
    });
    try {
      const r = await maybeRescueEvidenceWithEmbedding(
        { evidence_type: 'observational_reported_fact', evidence: 'x' },
        'y',
        { ok: false, sim: 0.32 },
        { containmentThreshold: 0.4 },
      );
      assert.equal(r.ok, true);
      assert.equal(r.reason, 'embedding_cosine');
    } finally {
      delete process.env.RESILIENCE_EMBED_BORDERLINE_LOW;
    }
  });
});
