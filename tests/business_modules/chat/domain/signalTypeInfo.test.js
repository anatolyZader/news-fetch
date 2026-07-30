import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { describeSignalType } from '../../../../business_modules/chat/domain/signalTypeInfo.js';

describe('describeSignalType', () => {
  it('renders a full card for a known type', () => {
    const text = describeSignalType('compliance_enter_shelter');
    assert.match(text, /type: compliance_enter_shelter/);
    assert.match(text, /label: /);
    assert.match(text, /domain: compliance/);
    assert.match(text, /construct_role: /);
    assert.match(text, /mirror: non_compliance_exit_early/);
    assert.match(text, /- lifesaving_behavior: role=primary polarity=\+/);
    assert.match(text, /- leadership: role=inferred/);
  });

  it('canonicalizes aliases and says so', () => {
    const text = describeSignalType('leadership_visible_present');
    assert.match(text, /type: leadership_visible_presence/);
    assert.match(text, /canonicalized from "leadership_visible_present"/);
  });

  it('labels the non-scoring fallback type', () => {
    const text = describeSignalType('novel_behavior_observed');
    assert.match(text, /non-scoring fallback type/);
  });

  it('suggests close matches for unknown input', () => {
    const text = describeSignalType('sheltering');
    assert.match(text, /Unknown signal type "sheltering"/);
    assert.match(text, /Close matches: .*shelter/);
  });

  it('handles empty input without throwing', () => {
    const text = describeSignalType('');
    assert.match(text, /Unknown signal type/);
  });
});
