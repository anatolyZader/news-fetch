import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatStore } from '../../../../business_modules/chat/infrastructure/chatStore.js';

describe('chatStore listRecentSessions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chat-store-test-'));
  const store = createChatStore(join(dir, 'chat.db'));

  after(() => rmSync(dir, { recursive: true, force: true }));

  it('returns cross-date sessions for the owner ordered by recency', () => {
    const a = store.createSession({ ownerUid: 'u1', reportDate: '2026-07-23', title: 'older' });
    const b = store.createSession({ ownerUid: 'u1', reportDate: '2026-07-25', title: 'newer' });
    store.createSession({ ownerUid: 'u2', reportDate: '2026-07-25', title: 'other owner' });
    store.addMessage({ sessionId: a, role: 'user', content: 'q', meta: null });
    // Touch the newer session last so updated_at ordering is deterministic.
    store.touchSession({ ownerUid: 'u1', sessionId: b });

    const rows = store.listRecentSessions({ ownerUid: 'u1' });
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.report_date).sort(), ['2026-07-23', '2026-07-25']);
    assert.ok(rows.every((r) => r.title !== 'other owner'));
    assert.equal(rows.find((r) => r.id === a).message_count, 1);
  });

  it('respects and clamps the limit', () => {
    const rows = store.listRecentSessions({ ownerUid: 'u1', limit: 1 });
    assert.equal(rows.length, 1);
    const clamped = store.listRecentSessions({ ownerUid: 'u1', limit: 9999 });
    assert.equal(clamped.length, 2);
  });
});
