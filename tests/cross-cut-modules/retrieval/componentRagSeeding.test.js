import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  seedComponentRagHits,
  signalParentIds,
  dedupeHits,
  shouldSkipComponentRagSeed,
} from '../../../cross-cut-modules/retrieval/componentRagSeeding.js';

describe('componentRagSeeding', () => {
  it('dedupes hits by parentId', () => {
    const merged = dedupeHits([
      [{ parentId: 'a', chunkId: 'a1' }, { parentId: 'b', chunkId: 'b1' }],
      [{ parentId: 'a', chunkId: 'a2' }],
    ]);
    assert.equal(merged.length, 2);
  });

  it('collects signal parent ids', () => {
    const ids = signalParentIds([
      { article_url: 'http://x/1', source_id: 'src-1' },
    ]);
    assert.ok(ids.has('http://x/1'));
    assert.ok(ids.has('src-1'));
  });

  it('skips seed when assessment abstained', () => {
    assert.equal(
      shouldSkipComponentRagSeed({ assessmentMode: 'abstained', epistemicStatus: null }),
      true,
    );
    assert.equal(
      shouldSkipComponentRagSeed({ assessmentMode: 'normal', epistemicStatus: { sampling_status: 'blind' } }),
      true,
    );
  });

  it('returns empty when retrieval unavailable', async () => {
    const hits = await seedComponentRagHits({
      retrieval: null,
      reportDate: '2026-06-01',
      signals: [],
    });
    assert.deepEqual(hits, []);
  });

  it('filters hits already in signals', async () => {
    const retrieval = {
      hybridRetrieve: async () => [
        { parentId: 'dup-1', chunkId: 'c1', text: 'a' },
        { parentId: 'new-1', chunkId: 'c2', text: 'b' },
      ],
    };
    const hits = await seedComponentRagHits({
      retrieval,
      reportDate: '2026-06-01',
      focusComponents: ['leadership'],
      signals: [{ article_url: 'dup-1' }],
      assessmentMode: 'normal',
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].parentId, 'new-1');
    assert.equal(hits[0].seed_origin, 'component_rag');
  });
});
