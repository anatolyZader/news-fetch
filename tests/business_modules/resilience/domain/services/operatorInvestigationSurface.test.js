import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  operatorSurfaceMode,
  operatorMaxClaims,
  shouldUseRichDeterministicPath,
} from '../../../../../cross-cut-modules/resilience-contracts/operatorSurfaceMode.js';
import {
  groupPoolItemsBySource,
  poolItemSourceBucket,
} from '../../../../../cross-cut-modules/resilience-contracts/evidencePoolGrouping.js';
import {
  assignOperatorEpistemicRole,
  attachRichOperatorSurface,
  attachRichInvestigationPool,
  buildDeterministicNarrativeFromClaims,
  buildComponentInvestigationPool,
} from '../../../../../business_modules/resilience/domain/services/operatorInvestigationSurface.js';
import { SIGNAL_PROVENANCE } from '../../../../../business_modules/resilience/domain/services/evidenceEligibility.js';
import {
  finalizeOperatorNarrativeSurface,
  isStubNarrative,
} from '../../../../../business_modules/resilience/domain/services/operatorNarrativeSurface.js';

describe('operatorSurfaceMode', () => {
  it('defaults to legacy', () => {
    const env = { RESILIENCE_OPERATOR_SURFACE_MODE: undefined };
    assert.equal(operatorSurfaceMode(env), 'legacy');
    assert.equal(shouldUseRichDeterministicPath(env), false);
  });

  it('rich when env set', () => {
    const env = { RESILIENCE_OPERATOR_SURFACE_MODE: 'rich' };
    assert.equal(operatorSurfaceMode(env), 'rich');
    assert.equal(shouldUseRichDeterministicPath(env), true);
  });

  it('operatorMaxClaims defaults to 12', () => {
    assert.equal(operatorMaxClaims({}), 12);
    assert.equal(operatorMaxClaims({ RESILIENCE_OPERATOR_MAX_CLAIMS: '8' }), 8);
  });
});

describe('evidencePoolGrouping', () => {
  it('groups pool items by source bucket', () => {
    const groups = groupPoolItemsBySource([
      { source_type: 'field', evidence: 'a' },
      { source_type: 'pbo', evidence: 'b' },
      { source_type: 'news', evidence: 'c' },
    ]);
    assert.equal(groups.length, 3);
    assert.equal(groups[0].key, 'field');
    assert.equal(poolItemSourceBucket({ source_type: 'news' }), 'press');
  });
});

describe('operatorInvestigationSurface', () => {
  const fearSignal = {
    signal_type: 'fear_expression',
    source_type: 'field',
    article_url: 'https://example.com/fear',
    evidence: 'Residents report elevated anxiety in shelter.',
    metricsEligible: true,
  };
  const macroSignal = {
    signal_type: 'fear_expression',
    source_type: 'news',
    article_url: 'https://example.com/macro',
    evidence: 'National press mentions northern Israel.',
    signalProvenance: SIGNAL_PROVENANCE.narrative_national_context,
    metricsEligible: false,
  };

  it('assignOperatorEpistemicRole labels context and scored', () => {
    const scoringSet = new Set([fearSignal]);
    const quarantineSet = new Set();
    assert.equal(assignOperatorEpistemicRole(fearSignal, scoringSet, quarantineSet), 'scored');
    assert.equal(assignOperatorEpistemicRole(macroSignal, scoringSet, quarantineSet), 'context_only');
  });

  it('buildComponentInvestigationPool returns all mapped signals', () => {
    const pool = buildComponentInvestigationPool('narrative', [fearSignal, macroSignal], {
      scoringSet: new Set([fearSignal]),
      quarantineSet: new Set(),
      maxChars: 500,
    });
    assert.equal(pool.length, 2);
    assert.equal(pool.some((p) => p.operator_epistemic_role === 'scored'), true);
    assert.equal(pool.some((p) => p.operator_epistemic_role === 'context_only'), true);
  });

  it('attachRichOperatorSurface populates pool without raw narrative dump', () => {
    const prev = process.env.RESILIENCE_OPERATOR_SURFACE_MODE;
    process.env.RESILIENCE_OPERATOR_SURFACE_MODE = 'rich';
    try {
      const assessment = {
        components: [{
          component_id: 'narrative',
          operator_display_state: 'insufficient_data',
          confidence: 'insufficient_data',
          instrument: { signal_count: 1, source_diversity: 1 },
        }],
      };
      attachRichOperatorSurface(assessment, {
        narrativeScopeSignals: [fearSignal],
        signalsForScoring: [],
        quarantinedSignals: [],
        scoringQuarantinedSignals: [fearSignal],
      });
      const comp = assessment.components[0];
      assert.equal(assessment.operator_surface_mode, 'rich');
      assert.equal(comp.operator_surface_starved, false);
      assert.ok(comp.operator_investigation_pool?.length >= 1);
      assert.equal(comp.narrative_operator, undefined);
      assert.equal(comp.operator_evidence_tier, 'rich_pool');
      finalizeOperatorNarrativeSurface(assessment);
      assert.ok(comp.narrative_operator?.length > 0);
      assert.ok(!comp.narrative_operator.includes('avg='));
      assert.ok(comp.operator_investigation_pool?.length >= 1);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_OPERATOR_SURFACE_MODE;
      else process.env.RESILIENCE_OPERATOR_SURFACE_MODE = prev;
    }
  });

  it('attachRichInvestigationPool preserves hybrid polished narrative_operator', () => {
    const prev = process.env.RESILIENCE_OPERATOR_SURFACE_MODE;
    process.env.RESILIENCE_OPERATOR_SURFACE_MODE = 'rich';
    try {
      const polished = (
        'Community narrative draws on multiple channels ([field](https://example.com/fear)). '
        + 'Residents report sustained coping under alert conditions.'
      );
      const comp = {
        component_id: 'narrative',
        narrative_operator: polished,
        narrative_grounding_score: 0.92,
        narrative_claims: [{
          text: 'Residents report elevated anxiety in shelter.',
          signal_refs: ['fear_expression@url:https://example.com/fear'],
        }],
      };
      const pool = buildComponentInvestigationPool('narrative', [fearSignal], {
        scoringSet: new Set([fearSignal]),
        quarantineSet: new Set(),
        maxChars: 500,
      });
      attachRichInvestigationPool(comp, pool);
      assert.equal(comp.narrative_operator, polished);
      assert.ok(comp.operator_investigation_pool?.length >= 1);
      finalizeOperatorNarrativeSurface({ components: [comp] });
      assert.equal(comp.narrative_operator, polished);
      assert.ok(!isStubNarrative(comp.narrative_operator));
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_OPERATOR_SURFACE_MODE;
      else process.env.RESILIENCE_OPERATOR_SURFACE_MODE = prev;
    }
  });

  it('buildDeterministicNarrativeFromClaims groups by role', () => {
    const prose = buildDeterministicNarrativeFromClaims([
      { text: 'Scored line', operator_epistemic_role: 'scored' },
      { text: 'Context line', operator_epistemic_role: 'context_only' },
    ]);
    assert.match(prose, /Scored line/);
    assert.match(prose, /Context line/);
    assert.match(prose, /National or regional context/);
  });
});
