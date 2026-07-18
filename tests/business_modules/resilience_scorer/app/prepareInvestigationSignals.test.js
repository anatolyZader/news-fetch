import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepareInvestigationSignals } from '../../../../business_modules/resilience_scorer/app/assessment/prepareSignals.js';

describe('prepareInvestigationSignals', () => {
  it('returns investigation signals without OOV scoring synthesis', async () => {
    const signals = [{
      signal_type: 'information_clarity',
      source_type: 'news',
      evidence: 'Clear guidance published.',
      evidence_type: 'named_institutional_fact',
    }];
    const result = await prepareInvestigationSignals({
      investigationSignals: signals,
      reportDate: '2026-06-01',
      reportScopeId: 'national',
      reportsDir: '/tmp/nonexistent-reports-dir',
    });
    assert.equal(result.investigationSignals.length, 1);
    assert.ok(result.dataVoid);
    assert.equal(result.oovScoringApplied, undefined);
  });
});
