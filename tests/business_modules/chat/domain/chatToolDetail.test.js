import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeChatToolCall } from '../../../../business_modules/chat/domain/tools/chatToolSchemas.js';

describe('describeChatToolCall', () => {
  it('joins whitelisted fields in a stable order', () => {
    const detail = describeChatToolCall({
      component: 'community_capital',
      date_a: '2026-07-20',
      date_b: '2026-07-26',
      municipality: 'Kiryat Shmona',
      limit: 50,
    });
    assert.equal(detail, 'community_capital · Kiryat Shmona · 2026-07-20 · 2026-07-26');
  });

  it('ignores non-whitelisted fields and empty values', () => {
    assert.equal(describeChatToolCall({ limit: 10, max_chars: 8000, note: 'x', query: '' }), '');
    assert.equal(describeChatToolCall(null), '');
    assert.equal(describeChatToolCall('not-an-object'), '');
  });

  it('truncates long values and the total detail string', () => {
    const detail = describeChatToolCall({ query: 'a'.repeat(200), source_id: 'b'.repeat(200) });
    assert.ok(detail.length <= 140, `too long: ${detail.length}`);
    assert.ok(detail.includes('…'));
  });

  it('flattens newlines out of values', () => {
    assert.equal(describeChatToolCall({ query: 'line1\nline2' }), 'line1 line2');
  });
});

describe('signal flag detail fields', () => {
  it('renders signal_id and reason', () => {
    const detail = describeChatToolCall({ signal_id: 'signals-news-2026-07-12.json#3', reason: 'wrong_type' });
    assert.equal(detail, 'signals-news-2026-07-12.json#3 · wrong_type');
  });

  it('keeps note and source_ref server-side', () => {
    assert.equal(describeChatToolCall({ note: 'secret prose', source_ref: 'http://x' }), '');
  });
});
