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
    const out = compressChatToolResult('propose_validation_decision', raw, { enabled: true });
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

  it('truncates compare_dates when very long', () => {
    const raw = 'HEADER\n' + 'line\n'.repeat(3000);
    const out = compressChatToolResult('compare_dates', raw, { enabled: true });
    assert.ok(out.length < raw.length);
    assert.match(out, /truncated/);
  });
});
