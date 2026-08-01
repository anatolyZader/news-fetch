import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createStubChatAdapter } from '../../../../business_modules/chat/infrastructure/adapters/stubChatAdapter.js';

describe('stubChatAdapter', () => {
  it('streams status + text deltas and returns assistantText', async () => {
    const adapter = createStubChatAdapter({ deltaCount: 3, deltaDelayMs: 1 });
    const events = [];
    const result = await adapter.streamChatResponse('', {}, [], (e) => events.push(e), null, {});

    assert.equal(events[0].type, 'status');
    const textEvents = events.filter((e) => e.type === 'text');
    assert.equal(textEvents.length, 3);
    assert.equal(result.stopReason, 'end_turn');
    assert.equal(result.assistantText, textEvents.map((e) => e.text).join(''));
  });

  it('stops streaming when aborted', async () => {
    const adapter = createStubChatAdapter({ deltaCount: 50, deltaDelayMs: 5 });
    const controller = new AbortController();
    const events = [];
    const promise = adapter.streamChatResponse('', {}, [], (e) => events.push(e), null, {
      abortSignal: controller.signal,
    });
    setTimeout(() => controller.abort(new Error('stop')), 15);
    await assert.rejects(promise, /stop/);
    assert.ok(events.filter((e) => e.type === 'text').length < 50);
  });

  it('returns canned title and followups', async () => {
    const adapter = createStubChatAdapter();
    assert.equal(typeof await adapter.generateChatTitle('x'), 'string');
    const followups = await adapter.generateChatFollowups({ question: 'q', answer: 'a' });
    assert.ok(Array.isArray(followups) && followups.length > 0);
    assert.equal(await adapter.generateChatSummary({ transcript: 't' }), null);
  });
});
