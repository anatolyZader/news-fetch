import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnMetaCollector } from '../../../../business_modules/chat/input/chatRoutes.js';

describe('createTurnMetaCollector', () => {
  it('collects citations, tools, and suggestions from the event stream', () => {
    const c = createTurnMetaCollector();
    c.onEvent({ type: 'tool_start', name: 'lookup_signals' });
    c.onEvent({ type: 'citation', citations: [{ source_id: 'db:1' }, { source_id: 'db:1' }] });
    c.onEvent({ type: 'citation', citations: [{ source_id: 'db:2' }] });
    c.onEvent({ type: 'suggestions', items: ['follow up?'] });
    c.onEvent({ type: 'done' });
    assert.deepEqual(c.buildMeta(), {
      citations: [{ source_id: 'db:1' }, { source_id: 'db:2' }],
      tools: ['lookup_signals'],
      suggestions: ['follow up?'],
    });
  });

  it('citations_final replaces streamed citations with the grounded set', () => {
    const c = createTurnMetaCollector();
    c.onEvent({ type: 'citation', citations: [{ source_id: 'db:1' }, { source_id: 'db:2' }] });
    c.onEvent({
      type: 'citations_final',
      citations: [{ source_id: 'db:2', used: true }, { source_id: 'db:1', used: false }],
    });
    assert.deepEqual(c.buildMeta().citations, [
      { source_id: 'db:2', used: true },
      { source_id: 'db:1', used: false },
    ]);
  });

  it('maps terminal events and manual marks to banner/stopped flags', () => {
    const err = createTurnMetaCollector();
    err.onEvent({ type: 'error', message: 'x' });
    assert.equal(err.buildMeta().banner, 'error');

    const fallback = createTurnMetaCollector();
    fallback.onEvent({ type: 'done', mode: 'deterministic_fallback' });
    assert.equal(fallback.buildMeta().banner, 'deterministic_fallback');

    const exhausted = createTurnMetaCollector();
    exhausted.onEvent({ type: 'done', loop_exhausted: true });
    assert.equal(exhausted.buildMeta().banner, 'loop_exhausted');

    const stopped = createTurnMetaCollector();
    stopped.markStopped();
    assert.deepEqual(stopped.buildMeta(), { stopped: true });
  });

  it('returns null meta for an uneventful turn', () => {
    const c = createTurnMetaCollector();
    c.onEvent({ type: 'text', text: 'hello' });
    c.onEvent({ type: 'done' });
    assert.equal(c.buildMeta(), null);
  });
});
