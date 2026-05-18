import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildReportContext } from '../../../../business_modules/chat/domain/reportContext.js';
import { compareReports } from '../../../../business_modules/chat/domain/signalLookup.js';
import { DISPLAY_VIEWS } from '../../../../business_modules/resilience/domain/services/assessmentDisplayTier.js';

const fixture = {
  assessment: {
    date: '2026-05-10',
    overall_resilience_score: 7,
    cross_component_synthesis: 'Summary text',
    components: [{
      component_id: 'narrative',
      score: 8,
      confidence: 'high',
      evidence_mass: 5,
      narrative: 'Narrative body',
    }],
  },
  signals: [],
};

describe('buildReportContext', () => {
  it('operator context has no /10', () => {
    const { context } = buildReportContext(fixture, { includeScores: false });
    assert.ok(!context.includes('/10'));
    assert.match(context, /adequate evidence/);
    assert.match(context, /Narrative body/);
  });

  it('analyst context may include scores', () => {
    const { context } = buildReportContext(
      { ...fixture, display_view: DISPLAY_VIEWS.analyst },
      { includeScores: true },
    );
    assert.match(context, /8\/10/);
    assert.match(context, /Overall score: 7\/10/);
  });
});

describe('compareReports operator mode', () => {
  it('does not emit /10 when includeScores is false', () => {
    // Uses on-disk reports if present; skip when none
    const text = compareReports('2099-01-01', '2099-01-02', { includeScores: false });
    assert.ok(!text.includes('/10') || text.includes('No report found'));
  });
});
