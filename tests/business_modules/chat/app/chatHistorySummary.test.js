import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createChatSessionService } from '../../../../business_modules/chat/app/chatSessionService.js';

function msg(id, role, content, meta = null) {
  return { id, role, content, meta };
}

function makeConversation(turns) {
  const out = [];
  for (let i = 0; i < turns; i++) {
    out.push(
      msg(`u${i}`, 'user', `question ${i}`),
      msg(`a${i}`, 'assistant', `answer ${i}`, i === 0
        ? { citations: [{ source_id: 'db:7' }] }
        : null),
    );
  }
  return out;
}

function fakeStore({ messages, session }) {
  const summaryWrites = [];
  return {
    summaryWrites,
    getSession: () => session,
    listMessages: () => messages,
    addMessage: () => {},
    touchSession: () => {},
    renameSession: () => true,
    getFirstUserMessage: () => messages.find((m) => m.role === 'user')?.content ?? null,
    updateSessionSummary: (args) => { summaryWrites.push(args); return true; },
  };
}

afterEach(() => {
  delete process.env.CHAT_HISTORY_SUMMARY;
});

describe('chat history rolling summarization', () => {
  it('prepareTurn replays only the tail after the summary cursor and returns the summary', () => {
    const messages = makeConversation(5); // u0..a4, 10 messages
    const store = fakeStore({
      messages,
      session: {
        id: 's1', owner_uid: 'u1', title: 'T',
        summary: 'earlier context brief', summary_through_id: 'a1',
      },
    });
    const svc = createChatSessionService({ chatStore: store });
    const prepared = svc.prepareTurn({ ownerUid: 'u1', sessionId: 's1', body: { message: 'next' } });

    assert.equal(prepared.historySummary, 'earlier context brief');
    assert.deepEqual(prepared.history.map((m) => m.content),
      ['question 2', 'answer 2', 'question 3', 'answer 3', 'question 4', 'answer 4']);
  });

  it('prepareTurn ignores a stale summary whose cursor message no longer exists', () => {
    const messages = makeConversation(3);
    const store = fakeStore({
      messages,
      session: {
        id: 's1', owner_uid: 'u1', title: 'T',
        summary: 'stale brief', summary_through_id: 'gone',
      },
    });
    const svc = createChatSessionService({ chatStore: store });
    const prepared = svc.prepareTurn({ ownerUid: 'u1', sessionId: 's1', body: { message: 'next' } });

    assert.equal(prepared.historySummary, '');
    assert.equal(prepared.history.length, 6);
  });

  it('CHAT_HISTORY_SUMMARY=0 disables the summary split', () => {
    process.env.CHAT_HISTORY_SUMMARY = '0';
    const messages = makeConversation(3);
    const store = fakeStore({
      messages,
      session: { id: 's1', owner_uid: 'u1', title: 'T', summary: 'brief', summary_through_id: 'a0' },
    });
    const svc = createChatSessionService({ chatStore: store });
    const prepared = svc.prepareTurn({ ownerUid: 'u1', sessionId: 's1', body: { message: 'next' } });
    assert.equal(prepared.historySummary, '');
    assert.equal(prepared.history.length, 6);
  });

  it('finalizeTurn folds older turns once past the trigger, keeping a verbatim tail', async () => {
    const messages = makeConversation(10); // 20 messages, no cursor yet
    const store = fakeStore({
      messages,
      session: { id: 's1', owner_uid: 'u1', title: 'T', summary: '', summary_through_id: '' },
    });
    const summaryCalls = [];
    const svc = createChatSessionService({
      chatStore: store,
      chatLlmPort: {
        generateChatTitle: async () => null,
        generateChatSummary: async (args) => { summaryCalls.push(args); return 'new rolling summary'; },
      },
    });

    await svc.finalizeTurn({ ownerUid: 'u1', sessionId: 's1', assistantText: 'answer 9', userMessage: 'question 9' });

    assert.equal(summaryCalls.length, 1);
    // 20 pending − 12 tail = 8 folded, cursor lands on the 8th message (a3).
    assert.equal(store.summaryWrites.length, 1);
    assert.equal(store.summaryWrites[0].summary, 'new rolling summary');
    assert.equal(store.summaryWrites[0].throughId, 'a3');
    assert.ok(summaryCalls[0].transcript.includes('[cited: db:7]'), 'folded turns carry their citations');
    assert.equal(summaryCalls[0].previousSummary, '');
  });

  it('finalizeTurn does not summarize below the trigger and never breaks the turn on failure', async () => {
    const shortStore = fakeStore({
      messages: makeConversation(4), // 8 messages < trigger
      session: { id: 's1', owner_uid: 'u1', title: 'T', summary: '', summary_through_id: '' },
    });
    let called = 0;
    const svc = createChatSessionService({
      chatStore: shortStore,
      chatLlmPort: {
        generateChatTitle: async () => null,
        generateChatSummary: async () => { called++; throw new Error('boom'); },
      },
    });
    await svc.finalizeTurn({ ownerUid: 'u1', sessionId: 's1', assistantText: 'a', userMessage: 'q' });
    assert.equal(called, 0);
    assert.equal(shortStore.summaryWrites.length, 0);

    // Past the trigger, a throwing summarizer must still resolve finalizeTurn.
    const longStore = fakeStore({
      messages: makeConversation(10),
      session: { id: 's1', owner_uid: 'u1', title: 'T', summary: '', summary_through_id: '' },
    });
    const svc2 = createChatSessionService({
      chatStore: longStore,
      chatLlmPort: {
        generateChatTitle: async () => null,
        generateChatSummary: async () => { throw new Error('boom'); },
      },
    });
    await assert.doesNotReject(
      svc2.finalizeTurn({ ownerUid: 'u1', sessionId: 's1', assistantText: 'a', userMessage: 'q' }),
    );
    assert.equal(longStore.summaryWrites.length, 0);
  });
});
