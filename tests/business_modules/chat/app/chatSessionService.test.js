import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createChatSessionService } from '../../../../business_modules/chat/app/chatSessionService.js';

function fakeStore(messages) {
  const added = [];
  return {
    added,
    getSession: () => ({ id: 's1', owner_uid: 'u1', title: 'T' }),
    listMessages: () => messages,
    addMessage: (m) => added.push(m),
    touchSession: () => {},
    renameSession: () => true,
    getFirstUserMessage: () => messages.find((m) => m.role === 'user')?.content ?? null,
  };
}

describe('chatSessionService prepareTurn', () => {
  it('regenerate truncates the previous answer and does not duplicate the question', () => {
    const store = fakeStore([
      { id: 'm1', role: 'user', content: 'first question' },
      { id: 'm2', role: 'assistant', content: 'first answer' },
      { id: 'm3', role: 'user', content: 'current question' },
      { id: 'm4', role: 'assistant', content: 'stale answer' },
    ]);
    const svc = createChatSessionService({ chatStore: store });

    const prepared = svc.prepareTurn({
      ownerUid: 'u1',
      sessionId: 's1',
      body: { action: 'regenerate' },
    });

    assert.equal(prepared.error, undefined);
    assert.equal(prepared.userMessage, 'current question');
    assert.deepEqual(prepared.history, [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
    ]);
    assert.equal(store.added.length, 0, 'regenerate must not re-persist the user message');
  });

  it('finalizeTurn skips title generation when the turn produced no text', async () => {
    const store = fakeStore([{ id: 'm1', role: 'user', content: 'q' }]);
    let titleCalls = 0;
    const svc = createChatSessionService({
      chatStore: store,
      chatLlmPort: { generateChatTitle: async () => { titleCalls++; return 'T'; } },
    });

    await svc.finalizeTurn({ ownerUid: 'u1', sessionId: 's1', assistantText: '', userMessage: 'q' });
    assert.equal(titleCalls, 0, 'no title spend for an empty/aborted turn');
    assert.equal(store.added.length, 0, 'no assistant message persisted');
  });

  it('send persists the user message and keeps full history', () => {
    const store = fakeStore([
      { id: 'm1', role: 'user', content: 'q1' },
      { id: 'm2', role: 'assistant', content: 'a1' },
    ]);
    const svc = createChatSessionService({ chatStore: store });

    const prepared = svc.prepareTurn({
      ownerUid: 'u1',
      sessionId: 's1',
      body: { action: 'send', message: 'q2' },
    });

    assert.equal(prepared.userMessage, 'q2');
    assert.equal(prepared.history.length, 2);
    assert.equal(store.added.length, 1);
    assert.equal(store.added[0].content, 'q2');
  });
});
