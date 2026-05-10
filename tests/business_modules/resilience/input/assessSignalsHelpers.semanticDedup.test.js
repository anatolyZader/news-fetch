import test from 'node:test';
import assert from 'node:assert/strict';

import { crossSourceDedupSemantic } from '../../../../business_modules/resilience/input/assessSignalsHelpers.js';

function fakeEmbedding(text) {
  const v = new Array(8).fill(0);
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) v[i % 8] += s.charCodeAt(i) % 29;
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}

test('crossSourceDedupSemantic collapses paraphrased duplicates within same source_type+signal_type', async () => {
  const oldFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const vec = fakeEmbedding(body.input);
    return {
      ok: true,
      status: 200,
      async json() {
        return { data: [{ embedding: vec }] };
      },
      async text() {
        return '';
      },
    };
  };

  process.env.RESILIENCE_EMBEDDING_API_KEY = 'test';
  process.env.RESILIENCE_SEMANTIC_DEDUP = '1';
  process.env.RESILIENCE_SEMANTIC_DEDUP_THRESHOLD = '0.80';

  const signals = [
    {
      source_type: 'news',
      signal_type: 'service_disruption',
      evidence_type: 'observational_reported_fact',
      temporal_weight: 1.0,
      evidence: 'Schools were closed in Nahariya due to rocket fire.',
      article_url: 'u1',
      article_source: 'A',
    },
    {
      source_type: 'news',
      signal_type: 'service_disruption',
      evidence_type: 'observational_reported_fact',
      temporal_weight: 0.85,
      evidence: 'Nahariya schools shut down after rockets; classes cancelled.',
      article_url: 'u2',
      article_source: 'B',
    },
  ];

  const out = await crossSourceDedupSemantic(signals);
  assert.equal(out.length, 1);
  assert.equal(out[0].signal_type, 'service_disruption');
  assert.ok(out[0]._semantic_dedup_count >= 2);

  global.fetch = oldFetch;
});

