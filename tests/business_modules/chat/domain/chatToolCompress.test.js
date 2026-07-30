import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { compressChatToolResult } from '../../../../business_modules/chat/domain/chatToolCompress.js';

describe('chatToolCompress', () => {
  it('compresses get_source to JSON excerpt', () => {
    const raw =
      'source_id=md:2026-05-30:1\n' +
      'title: Test article\n' +
      'source_type: news\n' +
      'url: https://example.com\n' +
      '\n' +
      'body '.repeat(500);
    const out = compressChatToolResult('get_source', raw, { enabled: true });
    const parsed = JSON.parse(out);
    assert.equal(parsed.source_id, 'md:2026-05-30:1');
    assert.ok(parsed.body_excerpt.length <= 2000);
  });

  it('passes through propose tools unchanged', () => {
    const raw = 'Action proposed (ID: abc).';
    const out = compressChatToolResult('propose_geo_unknown_update', raw, { enabled: true });
    assert.equal(out, raw);
  });

  it('bypasses compression for economy full', () => {
    const raw = 'x'.repeat(10_000);
    const out = compressChatToolResult('list_attention_items', raw, {
      enabled: true,
      economyOverride: 'full',
    });
    assert.equal(out, raw);
  });

  it('get_report_context keeps up to 12k chars instead of the 4k default', () => {
    const raw = 'C'.repeat(10_000);
    const out = compressChatToolResult('get_report_context', raw, { enabled: true });
    assert.equal(out, raw, '10k payload must survive intact');
    const big = 'C'.repeat(20_000);
    const truncated = compressChatToolResult('get_report_context', big, { enabled: true });
    assert.ok(truncated.length < 20_000);
    assert.ok(truncated.length >= 11_000, `should truncate near 12k, got ${truncated.length}`);
  });

  it('truncates compare_dates when very long', () => {
    const raw = 'HEADER\n' + 'line\n'.repeat(3000);
    const out = compressChatToolResult('compare_dates', raw, { enabled: true });
    assert.ok(out.length < raw.length);
    assert.match(out, /truncated/);
  });
});

describe('new tool compression', () => {
  it('get_signal keeps up to 8k chars instead of the 4k default', () => {
    const raw = 'S'.repeat(6000);
    assert.equal(compressChatToolResult('get_signal', raw, { enabled: true }), raw);
    const big = 'S'.repeat(12_000);
    const out = compressChatToolResult('get_signal', big, { enabled: true });
    assert.ok(out.length < 12_000);
    assert.ok(out.length >= 7000, `should truncate near 8k, got ${out.length}`);
  });

  it('get_source error strings pass through unmangled', () => {
    for (const err of [
      'Markdown file missing for source_id=md:a.md#1.',
      'No article found for source_id=md:a.md#2.',
      'No source found for source_id=db:9. Try search_sources or list_sources first.',
    ]) {
      assert.equal(compressChatToolResult('get_source', err, { enabled: true }), err);
    }
  });
});
