import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDigitalQuarantineNarrativeBlock,
  narrativeQuarantineContextActive,
} from '../../../../../../business_modules/resilience_scorer/domain/services/narrativeGrounding/digitalQuarantineNarrativeContext.js';
import { QUARANTINE_REASON } from '../../../../../../business_modules/resilience_scorer/domain/services/dataVoid/scoringPartition.js';

describe('digitalQuarantineNarrativeContext', () => {
  it('returns empty block when partition not applied', () => {
    assert.equal(formatDigitalQuarantineNarrativeBlock({}), '');
    assert.equal(narrativeQuarantineContextActive({}), false);
  });

  it('returns epistemic block when digital quarantined from scoring', () => {
    const block = formatDigitalQuarantineNarrativeBlock({
      quarantinedDigital: { count: 8, reason: QUARANTINE_REASON.DIGITAL_DARKNESS },
      scoringPartition: {
        partitionApplied: true,
        assessmentMode: 'field_anchor_only',
        quarantineReason: QUARANTINE_REASON.DIGITAL_DARKNESS,
      },
      narrativeScopeSignalCount: 155,
      signalsScoringUsed: 47,
    });
    assert.ok(block.includes('EPISTEMIC_PARTITION'));
    assert.ok(block.includes('155'));
    assert.ok(block.includes('8 digital signal'));
    assert.ok(block.includes('MUST still extract claims'));
    assert.equal(narrativeQuarantineContextActive({ quarantinedDigital: { count: 1 }, scoringPartition: { partitionApplied: true, quarantinedSignals: [{}] } }), true);
  });
});
