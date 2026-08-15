import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatFactsUserMessageForComponents } from '../../../../business_modules/resilience_scorer/infrastructure/narrativeFactsExtract.js';

function buildRegistry() {
  return {
    byComponent: {
      leadership: [
        { label: 'S1', ref: 'institutional_trust@idx:3', signal: { signal_type: 'institutional_trust', evidence: 'e1', article_index: 3 } },
      ],
    },
  };
}

describe('formatFactsUserMessageForComponents', () => {
  it('omits the retry block when no feedback is supplied', () => {
    const msg = formatFactsUserMessageForComponents(buildRegistry(), ['leadership']);
    assert.ok(!msg.includes('FIX THESE ISSUES FROM PRIOR ATTEMPT'));
    assert.match(msg, /Extract narrative_claims for each component/);
  });

  it('carries judge feedback into the retry prompt', () => {
    const feedback = 'leadership: invented relation in claim "X" — unsupported link';
    const msg = formatFactsUserMessageForComponents(buildRegistry(), ['leadership'], '', '', feedback);
    assert.match(msg, /FIX THESE ISSUES FROM PRIOR ATTEMPT/);
    assert.ok(msg.includes(feedback));
    // Feedback must precede the signals so the retry reads it before re-extracting.
    assert.ok(msg.indexOf(feedback) < msg.indexOf('Extract narrative_claims'));
  });
});
