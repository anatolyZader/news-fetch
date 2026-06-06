import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResilienceAssessmentSnapshot } from '../../../../../business_modules/resilience/domain/value_objects/resilienceAssessmentSnapshot.js';
import { DISPLAY_VIEWS } from '../../../../../cross-cut-modules/resilience-contracts/displayViews.js';

describe('ResilienceAssessmentSnapshot VO', () => {
  it('normalizes scope and display view', () => {
    const snap = ResilienceAssessmentSnapshot.fromAssessment(
      { report_scope: { id: 'north', label: 'North' } },
      { canViewAnalyst: true, queryView: 'analyst' },
    );
    assert.equal(snap.reportScopeId, 'north');
    assert.equal(snap.isAnalystView(), true);
    assert.equal(snap.displayView, DISPLAY_VIEWS.analyst);
  });
});
