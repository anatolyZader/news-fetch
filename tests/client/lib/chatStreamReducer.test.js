import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  initialChatStreamState,
  reduceChatStreamEvent,
  buildAssistantTurnMeta,
  resolveAssistantErrorContent,
} from '../../../client/src/lib/chatStreamReducer.js';

describe('reduceChatStreamEvent', () => {
  it('updates phase on status event', () => {
    const state = initialChatStreamState();
    const accRef = { value: '' };
    const { state: next } = reduceChatStreamEvent(state, { type: 'status', phase: 'preparing' }, accRef);
    assert.equal(next.phase, 'preparing');
  });

  it('updates tool state on tool_start', () => {
    const state = initialChatStreamState();
    const accRef = { value: '' };
    const { state: next } = reduceChatStreamEvent(
      state,
      { type: 'tool_start', name: 'lookup_signals', round: 2, maxRounds: 3 },
      accRef,
    );
    assert.equal(next.phase, 'tool');
    assert.equal(next.toolName, 'lookup_signals');
    assert.equal(next.round, 2);
    assert.equal(next.maxRounds, 3);
  });

  it('accumulates text and returns terminal on done', () => {
    const state = initialChatStreamState();
    const accRef = { value: '' };
    reduceChatStreamEvent(state, { type: 'text', text: 'Hello' }, accRef);
    const { terminal } = reduceChatStreamEvent(state, { type: 'done' }, accRef);
    assert.equal(accRef.value, 'Hello');
    assert.equal(terminal, 'done');
  });
});

describe('buildAssistantTurnMeta', () => {
  it('marks loop_exhausted', () => {
    assert.deepEqual(buildAssistantTurnMeta({ loop_exhausted: true }, 'answer'), { banner: 'loop_exhausted' });
  });

  it('marks deterministic_fallback', () => {
    assert.deepEqual(
      buildAssistantTurnMeta({ mode: 'deterministic_fallback' }, 'answer'),
      { banner: 'deterministic_fallback' },
    );
  });

  it('marks planning_only when content matches guard', () => {
    assert.deepEqual(
      buildAssistantTurnMeta({}, "I'll search for sources. Now let me retrieve:"),
      { banner: 'planning_only' },
    );
  });
});

describe('resolveAssistantErrorContent', () => {
  it('prefers done message over partial accumulated text', () => {
    assert.equal(
      resolveAssistantErrorContent(
        { error: true, message: 'AI service unavailable — credits exhausted.' },
        "I'll search for press sources.",
      ),
      'AI service unavailable — credits exhausted.',
    );
  });
});
