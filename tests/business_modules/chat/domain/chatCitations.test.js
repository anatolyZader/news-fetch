import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCitationsFromToolResult,
  collectCitationEvent,
  partitionCitationsByUse,
} from '../../../../business_modules/chat/domain/chatCitations.js';

describe('extractCitationsFromToolResult', () => {
  it('extracts from formatSignals output (indented source_id + bare url)', () => {
    const raw =
      '[1] id=signals-news-2026-07-01.json#1 — fear_expression (news, 2026-07-01)\n' +
      '    source_id=md:db/news/2026-07-01.md#3\n' +
      '    residents reported staying near shelters\n' +
      '    https://example.com/article-1\n\n' +
      '[2] id=signals-news-2026-07-01.json#2 — mutual_aid (news, 2026-07-01)\n' +
      '    source_id=md:db/news/2026-07-01.md#7\n' +
      '    neighbors organized supplies';
    const out = extractCitationsFromToolResult('lookup_signals', raw);
    assert.equal(out.length, 2);
    assert.equal(out[0].source_id, 'md:db/news/2026-07-01.md#3');
    assert.equal(out[0].url, 'https://example.com/article-1');
    assert.equal(out[1].source_id, 'md:db/news/2026-07-01.md#7');
  });

  it('extracts from formatCandidates output with titles', () => {
    const raw =
      '[1] source_id=db:42\n' +
      'title: Rocket damage in the north\n' +
      'url: https://news.example/a\n' +
      'snippet: something happened\n\n' +
      '[2] source_id=db:43\n' +
      'title: Volunteers mobilize\n' +
      'snippet: more text';
    const out = extractCitationsFromToolResult('search_sources', raw);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], { source_id: 'db:42', title: 'Rocket damage in the north', url: 'https://news.example/a' });
    assert.equal(out[1].title, 'Volunteers mobilize');
  });

  it('extracts from formatFullSource output', () => {
    const raw =
      'source_id=md:db/news/x.md#1\n' +
      'title: Full article\n' +
      'url: https://news.example/full\n' +
      '\n' +
      'Body text here.';
    const out = extractCitationsFromToolResult('get_source', raw);
    assert.equal(out.length, 1);
    assert.equal(out[0].source_id, 'md:db/news/x.md#1');
  });

  it('falls back to JSON source_id fields', () => {
    const raw = '{"hits":[{"source_id":"db:9","snippet":"x"},{"source_id":"db:10"}]}';
    const out = extractCitationsFromToolResult('search_sources', raw);
    assert.deepEqual(out.map((c) => c.source_id), ['db:9', 'db:10']);
  });

  it('dedupes and caps at 8', () => {
    const blocks = [];
    for (let i = 0; i < 12; i++) {
      blocks.push(`[${i + 1}] source_id=db:${i % 10}\nsnippet: s`);
    }
    const out = extractCitationsFromToolResult('list_sources', blocks.join('\n\n'));
    assert.equal(out.length, 8);
    assert.equal(new Set(out.map((c) => c.source_id)).size, 8);
  });

  it('returns nothing for non-citation tools and empty/error results', () => {
    assert.deepEqual(extractCitationsFromToolResult('lookup_pbo', 'source_id=db:1'), []);
    assert.deepEqual(extractCitationsFromToolResult('get_source', ''), []);
    assert.deepEqual(extractCitationsFromToolResult('lookup_signals', 'No matching signals found.'), []);
  });
});

describe('collectCitationEvent', () => {
  it('dedupes by source_id and remembers the producing tool', () => {
    const list = [];
    collectCitationEvent(list, {
      type: 'citation',
      tool: 'lookup_signals',
      citations: [{ source_id: 'db:1', title: 'A' }, { source_id: 'db:2' }],
    });
    collectCitationEvent(list, {
      type: 'citation',
      tool: 'search_sources',
      citations: [{ source_id: 'db:1', title: 'dup' }],
    });
    assert.equal(list.length, 2);
    assert.equal(list[0].title, 'A');
    assert.equal(list[0].tool, 'lookup_signals');
  });

  it('upgrades a duplicate to get_source (model actually read it)', () => {
    const list = [];
    collectCitationEvent(list, { type: 'citation', tool: 'search_sources', citations: [{ source_id: 'db:1' }] });
    collectCitationEvent(list, { type: 'citation', tool: 'get_source', citations: [{ source_id: 'db:1' }] });
    assert.equal(list[0].tool, 'get_source');
  });

  it('ignores non-citation events and blank ids', () => {
    const list = [];
    collectCitationEvent(list, { type: 'text', text: 'x' });
    collectCitationEvent(list, { type: 'citation', tool: 't', citations: [{ source_id: '' }, {}] });
    assert.deepEqual(list, []);
  });
});

describe('partitionCitationsByUse', () => {
  it('flags citations mentioned in the answer or read via get_source as used', () => {
    const flagged = partitionCitationsByUse([
      { source_id: 'db:1', tool: 'lookup_signals' },
      { source_id: 'db:2', tool: 'get_source' },
      { source_id: 'md:x.md#3', tool: 'search_sources', title: 'T' },
    ], 'The answer cites md:x.md#3 explicitly.');
    assert.deepEqual(flagged.map((c) => [c.source_id, c.used]), [
      ['db:2', true],
      ['md:x.md#3', true],
      ['db:1', false],
    ]);
    assert.equal(flagged.every((c) => c.tool === undefined), true, 'tool is internal, not persisted');
  });

  it('orders used first and caps at 8', () => {
    const citations = Array.from({ length: 12 }, (_, i) => ({ source_id: `db:${i}` }));
    const flagged = partitionCitationsByUse(citations, 'uses db:11 only');
    assert.equal(flagged.length, 8);
    assert.equal(flagged[0].source_id, 'db:11');
    assert.equal(flagged[0].used, true);
  });

  it('handles empty inputs', () => {
    assert.deepEqual(partitionCitationsByUse([], 'text'), []);
    assert.deepEqual(partitionCitationsByUse(null, 'text'), []);
  });
});
