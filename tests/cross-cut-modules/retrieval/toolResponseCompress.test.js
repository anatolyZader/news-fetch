import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compressHit,
  compressRetrieveResult,
  compressCrossSourceCompare,
} from '../../../cross-cut-modules/retrieval/toolResponseCompress.js';

describe('toolResponseCompress', () => {
  const hit = (id, text) => ({
    parentId: id,
    sourceType: 'news',
    title: 'Title',
    text: text ?? 'snippet text',
    rrfScore: 0.9,
  });

  it('compressHit truncates snippet to 200 chars', () => {
    const out = compressHit({ parentId: 's1', text: 'a'.repeat(300) });
    assert.equal(out.snippet_200.length, 200);
    assert.equal(out.source_id, 's1');
  });

  it('compressRetrieveResult caps hits by default', () => {
    const raw = Array.from({ length: 10 }, (_, i) => hit(`h${i}`));
    const out = compressRetrieveResult(raw);
    assert.equal(out.hits.length, 4);
    assert.equal(out.truncated, true);
    assert.equal(out.total_hits, 10);
  });

  it('compressRetrieveResult escalated allows more hits', () => {
    const raw = Array.from({ length: 10 }, (_, i) => hit(`h${i}`));
    const out = compressRetrieveResult(raw, { escalated: true });
    assert.equal(out.hits.length, 8);
  });

  it('compressCrossSourceCompare limits source types and hits per type', () => {
    const raw = {
      news: Array.from({ length: 5 }, (_, i) => hit(`n${i}`)),
      field: Array.from({ length: 5 }, (_, i) => hit(`f${i}`)),
      pbo: Array.from({ length: 5 }, (_, i) => hit(`p${i}`)),
    };
    const out = compressCrossSourceCompare(raw);
    assert.equal(Object.keys(out.by_source_type).length, 2);
    assert.equal(out.by_source_type.news.hits.length, 3);
    assert.equal(out.truncated, true);
  });
});
