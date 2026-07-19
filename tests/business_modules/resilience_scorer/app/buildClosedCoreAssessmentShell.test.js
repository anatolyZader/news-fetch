import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildClosedCoreAssessmentShell } from '../../../../business_modules/resilience_scorer/app/assessment/buildClosedCoreAssessmentShell.js';
import { COMPONENT_IDS } from '../../../../business_modules/resilience_scorer/domain/contracts/componentIds.js';

describe('buildClosedCoreAssessmentShell', () => {
  it('preserves evidence fields and leaves narratives empty', () => {
    const evidenceBasis = {
      sufficiency: 'moderate',
      signal_count: 3,
      distinct_articles: 2,
      distinct_sources: 2,
    };
    const scoredFull = Object.fromEntries(
      COMPONENT_IDS.map((id) => [id, {
        score: null,
        score_raw: null,
        score_headline: null,
        confidence: 'medium',
        signal_count: 3,
        distinct_article_count: 2,
        source_diversity: 2,
        evidence_basis: evidenceBasis,
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
      assert.equal(comp.score, undefined);
      assert.equal(comp.confidence, 'medium');
      assert.equal(comp.signal_count, 3);
      assert.equal(comp.distinct_article_count, 2);
      assert.equal(comp.source_diversity, 2);
      assert.deepEqual(comp.evidence_basis, evidenceBasis);
      assert.equal(comp.narrative, '');
      assert.deepEqual(comp.evidence, []);
    }
  });
});
