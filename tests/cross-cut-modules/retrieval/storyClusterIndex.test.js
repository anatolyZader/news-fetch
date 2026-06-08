import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createStoryClusterIndex } from '../../../cross-cut-modules/retrieval/storyClusterIndex.js';
import { crossSourceDedupClustered } from '../../../business_modules/resilience/app/assessSignalsHelpers.js';

function fakeEmbedding(text) {
  const v = new Array(8).fill(0);
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) v[i % 8] += (s.codePointAt(i) ?? 0) % 29;
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}

function mockEmbeddingFetch() {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          data: inputs.map((inp, index) => ({
            index,
            embedding: fakeEmbedding(inp),
          })),
        };
      },
      async text() {
        return '';
      },
    };
  };
  return oldFetch;
}

test('storyClusterIndex collapses paraphrases within same source_type+signal_type', async () => {
  const oldFetch = mockEmbeddingFetch();
  const oldKey = process.env.OPENAI_API_KEY;
  const oldVec = process.env.VECTOR_INDEX_EMBEDDINGS;
  process.env.RESILIENCE_EMBEDDING_API_KEY = 'test';
  process.env.RESILIENCE_DEDUP_CLUSTER_THRESHOLD = '0.80';
  process.env.RESILIENCE_DEDUP_CLUSTER_ENABLED = '1';

  const dbPath = join(tmpdir(), `story-cluster-${randomUUID()}.sqlite`);
  const index = createStoryClusterIndex(dbPath);

  const signals = [
    {
      source_type: 'news',
      signal_type: 'shelter_compliance',
      evidence: 'Residents entered public shelters during the alert in Haifa',
      temporal_weight: 1,
      evidence_type: 'observational_reported_fact',
    },
    {
      source_type: 'news',
      signal_type: 'shelter_compliance',
      evidence: 'Citizens went into municipal shelters when sirens sounded in Haifa',
      temporal_weight: 0.85,
      evidence_type: 'observational_reported_fact',
    },
  ];

  await index.upsertSignals(signals);
  const collapsed = index.collapseSignals(signals);

  assert.equal(collapsed.length, 1);
  assert.ok(collapsed[0].story_cluster_id);
  assert.ok((collapsed[0]._semantic_dedup_count ?? 1) >= 2);

  index.close();
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }

  globalThis.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = oldKey;
  if (oldVec === undefined) delete process.env.VECTOR_INDEX_EMBEDDINGS;
  else process.env.VECTOR_INDEX_EMBEDDINGS = oldVec;
  delete process.env.RESILIENCE_DEDUP_CLUSTER_THRESHOLD;
  delete process.env.RESILIENCE_DEDUP_CLUSTER_ENABLED;
  delete process.env.RESILIENCE_EMBEDDING_API_KEY;
});

test('crossSourceDedupClustered uses story cluster index when enabled', async () => {
  const oldFetch = mockEmbeddingFetch();
  process.env.RESILIENCE_EMBEDDING_API_KEY = 'test';
  process.env.RESILIENCE_DEDUP_CLUSTER_ENABLED = '1';
  process.env.RESILIENCE_DEDUP_CLUSTER_THRESHOLD = '0.80';

  const dbPath = join(tmpdir(), `story-dedup-${randomUUID()}.sqlite`);
  const storyClusterIndex = createStoryClusterIndex(dbPath);

  const signals = [
    {
      source_type: 'news',
      signal_type: 'service_disruption',
      evidence: 'Schools were closed in Nahariya due to rocket fire.',
      temporal_weight: 1,
      article_url: 'u1',
    },
    {
      source_type: 'news',
      signal_type: 'service_disruption',
      evidence: 'Nahariya schools shut down after rockets; classes cancelled.',
      temporal_weight: 0.85,
      article_url: 'u2',
    },
  ];

  const out = await crossSourceDedupClustered(signals, { storyClusterIndex });
  assert.equal(out.length, 1);

  storyClusterIndex.close();
  try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
  globalThis.fetch = oldFetch;
  delete process.env.RESILIENCE_EMBEDDING_API_KEY;
  delete process.env.RESILIENCE_DEDUP_CLUSTER_ENABLED;
  delete process.env.RESILIENCE_DEDUP_CLUSTER_THRESHOLD;
});
