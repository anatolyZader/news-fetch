import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildInvestigationSummary } from '../../../../../business_modules/resilience/domain/services/investigationSummary.js';

const pbo = { source_type: 'pbo', signal_type: 'service_continuity', evidence: 'Field report' };
const news1 = { source_type: 'news', signal_type: 'fear_expression', evidence: 'News report 1' };
const news2 = { source_type: 'news', signal_type: 'fear_expression', evidence: 'News report 2' };

describe('investigationSummary', () => {
  it('tracks scoring partition dual-use pools', () => {
    const investigationSignals = [pbo, news1, news2];
    const scoringSignals = [pbo];
    const summary = buildInvestigationSummary({}, {
      investigationSignals,
      scoringSignals,
      narrativeScopeSignals: investigationSignals,
      scoringPartitionApplied: true,
      scoringAssessmentMode: 'field_anchor_only',
      signalsScoringUsed: 1,
    });

    assert.equal(summary.signals_investigation, 3);
    assert.equal(summary.signals_narrative_scope, 3);
    assert.equal(summary.signals_scoring_used, 1);
    assert.equal(summary.signals_scoring_quarantined, 2);
    assert.equal(summary.scoring_partition_applied, true);
    assert.equal(summary.scoring_assessment_mode, 'field_anchor_only');
  });

  it('records prior quarantine skip reason', () => {
    const summary = buildInvestigationSummary({}, {
      investigationSignals: [pbo, news1],
      scoringSignals: [pbo, news1],
      priorQuarantineSkipped: 'volume_recovered',
    });
    assert.equal(summary.prior_quarantine_skipped, 'volume_recovered');
    assert.equal(summary.signals_scoring_quarantined, 0);
  });
});
