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

describe('citation events', () => {
  it('accumulates and dedupes citations into accRef', () => {
    const accRef = { value: '', citations: [] };
    const state = initialChatStreamState();
    reduceChatStreamEvent(state, {
      type: 'citation',
      tool: 'search_sources',
      citations: [{ source_id: 'db:1', title: 'A' }, { source_id: 'db:2' }],
    }, accRef);
    reduceChatStreamEvent(state, {
      type: 'citation',
      tool: 'get_source',
      citations: [{ source_id: 'db:1' }, { source_id: 'db:3' }],
    }, accRef);
    assert.deepEqual(accRef.citations.map((c) => c.source_id), ['db:1', 'db:2', 'db:3']);
    assert.equal(accRef.citations[0].title, 'A');
  });

  it('citation events are not terminal and skip malformed entries', () => {
    const accRef = { value: '', citations: [] };
    const { terminal } = reduceChatStreamEvent(initialChatStreamState(), {
      type: 'citation',
      citations: [{ title: 'no id' }, null],
    }, accRef);
    assert.equal(terminal, null);
    assert.deepEqual(accRef.citations, []);
  });

  it('citations_final replaces the streamed set with the grounded one', () => {
    const accRef = { value: '', citations: [{ source_id: 'db:1' }, { source_id: 'db:2' }] };
    const { terminal } = reduceChatStreamEvent(initialChatStreamState(), {
      type: 'citations_final',
      citations: [{ source_id: 'db:2', used: true }, { source_id: 'db:1', used: false }, { title: 'no id' }],
    }, accRef);
    assert.equal(terminal, null);
    assert.deepEqual(accRef.citations, [
      { source_id: 'db:2', used: true },
      { source_id: 'db:1', used: false },
    ]);
  });
});

describe('suggestions and tool detail', () => {
  it('stores suggestion items on accRef', () => {
    const accRef = { value: '' };
    const { terminal } = reduceChatStreamEvent(initialChatStreamState(), {
      type: 'suggestions',
      items: ['Follow up A?', '  ', 42, 'Follow up B?'],
    }, accRef);
    assert.equal(terminal, null);
    assert.deepEqual(accRef.suggestions, ['Follow up A?', 'Follow up B?']);
  });

  it('captures tool_start detail into stream state', () => {
    const { state } = reduceChatStreamEvent(initialChatStreamState(), {
      type: 'tool_start',
      name: 'lookup_signals',
      detail: 'coping · 2026-07-20',
      round: 2,
      maxRounds: 6,
    }, { value: '' });
    assert.equal(state.toolDetail, 'coping · 2026-07-20');
    assert.equal(state.toolName, 'lookup_signals');
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
