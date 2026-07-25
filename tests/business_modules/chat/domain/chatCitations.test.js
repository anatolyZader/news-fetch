import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractCitationsFromToolResult } from '../../../../business_modules/chat/domain/chatCitations.js';

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
