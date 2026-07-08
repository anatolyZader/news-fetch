import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildClosedCoreAssessmentShell } from '../../../../business_modules/resilience_scorer/app/assessment/buildClosedCoreAssessmentShell.js';
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';

describe('buildClosedCoreAssessmentShell', () => {
  it('preserves scores and leaves narratives empty', () => {
    const scoredFull = Object.fromEntries(
      COMPONENT_IDS.map((id) => [id, {
        score: 6.5,
        confidence: 'medium',
        signal_count: 3,
        signals: [{ signal_type: 'fear_expression', evidence: 'test' }],
      }]),
    );

    const shell = buildClosedCoreAssessmentShell({
      scoredFull,
      reportDate: '2026-04-12',
      scopedTotalArticles: 42,
      reportScope: { id: 'north', label: 'North' },
    });

    assert.equal(shell.assessment_mode, 'closed_core');
    assert.equal(shell.assessment_degraded, null);
    assert.equal(shell.total_articles_analyzed, 42);
    assert.equal(shell.components.length, COMPONENT_IDS.length);
    for (const comp of shell.components) {
      assert.equal(comp.score, 6.5);
      assert.equal(comp.narrative, '');
      assert.deepEqual(comp.evidence, []);
    }
  });
});
