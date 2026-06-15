import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderRunTraceMarkdown } from '../../../cross-cut-modules/log/domain/runTraceRender.js';

function itemEvent(overrides = {}) {
  return {
    seq: 0,
    type: 'item',
    source_type: 'news',
    batch: '[Step 1 — batch 1/1]',
    article: { title: 'Town returns', source: 'Ynet', url: 'https://x', source_id: 'a1' },
    raw_text: 'Mayor said schools reopen Sunday. Residents reported anxiety.',
    raw_text_len: 60,
    rag_trimmed: false,
    signals: [],
    ...overrides,
  };
}

describe('renderRunTraceMarkdown', () => {
  it('B-off layout: no rationale column, quote + self-check + status present', () => {
    const events = [itemEvent({
      signals: [
        { signal_type: 'leadership_clear_guidance', evidence: 'Mayor said schools reopen', confidence: 0.8, self_check: null, status: 'kept', dropped_by: null },
        { signal_type: 'information_clarity', evidence: 'explained to residents', confidence: 0.6, self_check: { verdict: 'no', reason: 'pundit framing' }, status: 'dropped', dropped_by: 'self_check' },
      ],
    })];
    const md = renderRunTraceMarkdown({ run: 'extract', sourceType: 'news', date: '2026-06-15', events });

    assert.match(md, /Extraction decision trace/);
    assert.match(md, /leadership_clear_guidance/);
    assert.doesNotMatch(md, /rationale/);
    assert.match(md, /self-check/);
    assert.match(md, /dropped \(self_check\)/);
    assert.match(md, /no — pundit framing/);
    assert.match(md, /signals kept: 1 · dropped: 1/);
  });

  it('B-on layout: rationale column shown when any signal has rationale', () => {
    const events = [itemEvent({
      signals: [
        { signal_type: 'service_continuity', evidence: 'schools reopen Sunday', confidence: 0.7, rationale: 'named service restart date', self_check: null, status: 'kept', dropped_by: null },
      ],
    })];
    const md = renderRunTraceMarkdown({ run: 'extract', sourceType: 'news', date: '2026-06-15', events });

    assert.match(md, /\| rationale \|/);
    assert.match(md, /named service restart date/);
  });

  it('renders rejected candidates section from rejected events', () => {
    const events = [
      itemEvent({ signals: [{ signal_type: 'service_continuity', evidence: 'x', confidence: 0.5, status: 'kept', dropped_by: null }] }),
      { seq: 1, type: 'rejected', batch: '[Step 1 — batch 1/1]', items: [{ text: 'Iran strategy talk', why: 'off-domain geopolitics' }] },
    ];
    const md = renderRunTraceMarkdown({ run: 'extract', sourceType: 'news', date: '2026-06-15', events });

    assert.match(md, /Rejected candidates/);
    assert.match(md, /Iran strategy talk/);
    assert.match(md, /off-domain geopolitics/);
  });

  it('flags RAG-trimmed raw text', () => {
    const events = [itemEvent({ rag_trimmed: true })];
    const md = renderRunTraceMarkdown({ run: 'extract', sourceType: 'news', date: '2026-06-15', events });
    assert.match(md, /RAG\/semantic-selected spans/);
  });
});
