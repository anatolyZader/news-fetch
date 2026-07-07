import { describe, it } from 'node:test';
import assert from 'node:assert';

import { applySourceCap, sourceCapWasApplied } from '../../../business_modules/resilience_scorer/domain/epistemic/evidenceCaps.js';
import { scoreComponents } from '../../../analyst/scoring/index.js';

function makeItems() {
  // Same source_type (source_type layer skipped), two outlets with a 0.57/0.43
  // split — above the strict 0.42 article_source cap, below the adaptive 0.6.
  return [
    { signal: { source_type: 'news', article_source: 'ynet' }, contribution: 1, polarity: '+' },
    { signal: { source_type: 'news', article_source: 'kan' }, contribution: 0.75, polarity: '+' },
  ];
}

describe('adaptive source-cap relaxation', () => {
  it('strict caps scale a dominant outlet when evidence mass is adequate', () => {
    const items = makeItems();
    const capped = applySourceCap(items, { totalEvidenceMass: 10 });
    assert.ok(sourceCapWasApplied(items, capped), 'share 0.57 must bind under the 0.42 cap');
  });

  it('caps are relaxed when total evidence mass is sparse (< 5)', () => {
    const items = makeItems();
    const capped = applySourceCap(items, { totalEvidenceMass: 2 });
    assert.ok(!sourceCapWasApplied(items, capped), 'share 0.57 must not bind under the adaptive 0.6 cap');
    assert.ok(capped.every((it) => it._adaptive_cap === true));
  });

  it('headline scoring passes total evidence mass, so sparse batches are not over-penalised', () => {
    const signals = [
      {
        article_index: 1, article_url: 'https://example.com/a1', article_source: 'ynet',
        source_type: 'news', signal_type: 'information_clarity',
        evidence_type: 'direct_quote_named_person', evidence: 'clear instructions',
        scope_level: 'repeated_pattern', temporal_weight: 1,
      },
      {
        article_index: 2, article_url: 'https://example.com/a2', article_source: 'kan',
        source_type: 'news', signal_type: 'information_clarity',
        evidence_type: 'observational_reported_fact', evidence: 'clear instructions elsewhere',
        scope_level: 'repeated_pattern', temporal_weight: 1,
      },
    ];
    const scored = scoreComponents(signals, { totalArticles: 2 });
    for (const [id, c] of Object.entries(scored)) {
      if (c.signal_count > 0) {
        assert.equal(c.source_cap_binding, false,
          `${id}: sparse two-signal batch must use relaxed caps (no binding)`);
      }
    }
  });
});
