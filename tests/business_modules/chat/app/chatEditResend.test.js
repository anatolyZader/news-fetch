import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatStore } from '../../../../business_modules/chat/infrastructure/chatStore.js';
import { createChatSessionService } from '../../../../business_modules/chat/app/chatSessionService.js';

describe('edit_resend with messageId (real sqlite store)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chat-edit-test-'));
  const store = createChatStore(join(dir, 'chat.db'));

  after(() => rmSync(dir, { recursive: true, force: true }));

  it('hideMessagesFrom hides the anchor and everything after it, in insertion order', () => {
    const sid = store.createSession({ ownerUid: 'u1', reportDate: '2026-07-26', title: '' });
    store.addMessage({ sessionId: sid, role: 'user', content: 'q1' });
    store.addMessage({ sessionId: sid, role: 'assistant', content: 'a1' });
    const editTarget = store.addMessage({ sessionId: sid, role: 'user', content: 'q2' });
    store.addMessage({ sessionId: sid, role: 'assistant', content: 'a2' });

    const hidden = store.hideMessagesFrom({ sessionId: sid, messageId: editTarget });
    assert.equal(hidden, 2);
    assert.deepEqual(
      store.listMessages({ sessionId: sid }).map((m) => m.content),
      ['q1', 'a1'],
    );
  });

  it('unknown message id hides nothing', () => {
    const sid = store.createSession({ ownerUid: 'u1', reportDate: '2026-07-26', title: '' });
    store.addMessage({ sessionId: sid, role: 'user', content: 'q1' });
    assert.equal(store.hideMessagesFrom({ sessionId: sid, messageId: 'nope' }), 0);
    assert.equal(store.listMessages({ sessionId: sid }).length, 1);
  });

  it('does not cross session boundaries', () => {
    const sidA = store.createSession({ ownerUid: 'u1', reportDate: '2026-07-26', title: '' });
    const sidB = store.createSession({ ownerUid: 'u1', reportDate: '2026-07-26', title: '' });
    const anchorA = store.addMessage({ sessionId: sidA, role: 'user', content: 'qa' });
    store.addMessage({ sessionId: sidB, role: 'user', content: 'qb' });

    store.hideMessagesFrom({ sessionId: sidA, messageId: anchorA });
    assert.equal(store.listMessages({ sessionId: sidA }).length, 0);
    assert.equal(store.listMessages({ sessionId: sidB }).length, 1);
  });

  it('prepareTurn edit_resend truncates at the edited message and persists the new text', () => {
    const sid = store.createSession({ ownerUid: 'u1', reportDate: '2026-07-26', title: 'T' });
    store.addMessage({ sessionId: sid, role: 'user', content: 'q1' });
    store.addMessage({ sessionId: sid, role: 'assistant', content: 'a1' });
    const target = store.addMessage({ sessionId: sid, role: 'user', content: 'q2 original' });
    store.addMessage({ sessionId: sid, role: 'assistant', content: 'a2 stale' });

    const svc = createChatSessionService({ chatStore: store });
    const prepared = svc.prepareTurn({
      ownerUid: 'u1',
      sessionId: sid,
      body: { action: 'edit_resend', messageId: target, message: 'q2 edited' },
    });

    assert.equal(prepared.error, undefined);
    assert.equal(prepared.userMessage, 'q2 edited');
    assert.deepEqual(prepared.history.map((m) => m.content), ['q1', 'a1']);
    assert.deepEqual(
      store.listMessages({ sessionId: sid }).map((m) => m.content),
      ['q1', 'a1', 'q2 edited'],
    );
  });
});
