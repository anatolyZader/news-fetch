import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applySourceCap, applyPboSettlementCap } from '../../../../../business_modules/resilience_scorer/domain/epistemic/evidenceCaps.js';

describe('evidenceCaps', () => {
  beforeEach(() => {
    // Pin default thresholds — the host env may carry temporary cap overrides.
    delete process.env.RESILIENCE_SOURCE_TYPE_CAP;
    delete process.env.RESILIENCE_ARTICLE_SOURCE_CAP;
  });

  it('applyPboSettlementCap limits one settlement dominance', () => {
    const items = [
      { signal: { source_type: 'pbo', article_source: 'pbo-abelin' }, contribution: 6, polarity: '+' },
      { signal: { source_type: 'pbo', article_source: 'pbo-abelin' }, contribution: 5, polarity: '+' },
      { signal: { source_type: 'pbo', article_source: 'pbo-other' }, contribution: 2, polarity: '+' },
    ];
    const capped = applyPboSettlementCap(items);
    const abelinMass = capped
      .filter((it) => it.signal.article_source === 'pbo-abelin')
      .reduce((s, it) => s + it.contribution, 0);
    const total = capped.reduce((s, it) => s + it.contribution, 0);
    assert.ok(abelinMass / total <= 0.46);
  });

  it('applySourceCap uses relaxed article outlet threshold', () => {
    const items = [
      { signal: { source_type: 'news', article_source: 'ynet.co.il' }, contribution: 8, polarity: '+' },
      { signal: { source_type: 'news', article_source: 'mako.co.il' }, contribution: 2, polarity: '+' },
    ];
    const capped = applySourceCap(items, { totalEvidenceMass: 10 });
    const ynetMass = capped
      .filter((it) => it.signal.article_source === 'ynet.co.il')
      .reduce((s, it) => s + it.contribution, 0);
    const total = capped.reduce((s, it) => s + it.contribution, 0);
    assert.ok(ynetMass / total <= 0.43);
  });
});
