import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { topContributorsFromScored } from '../../../../../business_modules/resilience_scorer/domain/services/topContributors.js';

describe('topContributorsFromScored', () => {
  it('prefers strong catalog links over weak links at equal raw contribution', () => {
    const scored = {
      signals: [
        {
          signal_type: 'compliance_enter_shelter',
          evidence: 'Shelter compliance',
          _contribution: 5,
        },
        {
          signal_type: 'leadership_visible_presence',
          evidence: 'Mayor visible daily',
          _contribution: 4.5,
        },
        {
          signal_type: 'leadership_clear_guidance',
          evidence: 'Clear municipal guidance',
          _contribution: 4,
        },
        {
          signal_type: 'symbolic_vs_substantive_action',
          evidence: 'Photo-op only',
          _contribution: 3.5,
        },
      ],
    };

    const top = topContributorsFromScored(scored, 'leadership');
    assert.equal(top[0].signal_type, 'leadership_visible_presence');
    assert.ok(!top.slice(0, 3).every((t) => t.signal_type === 'compliance_enter_shelter'));
  });

  it('falls back to raw ranking when fewer than three strong links exist', () => {
    const scored = {
      signals: [
        { signal_type: 'compliance_enter_shelter', _contribution: 9 },
        { signal_type: 'service_continuity', _contribution: 2 },
      ],
    };
    const top = topContributorsFromScored(scored, 'leadership');
    assert.equal(top.length, 2);
    assert.equal(top[0].signal_type, 'compliance_enter_shelter');
  });
});
