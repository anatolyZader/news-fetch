import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENT_IDS } from '../../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import {
  attachComponentDiagnostics,
  buildEvidencePartitionsByComponent,
  buildSingleComponentDiagnostics,
  deriveAssessmentState,
  deriveOperatorDisplayState,
  findUnknownComponentIds,
} from '../../../../../business_modules/resilience_scorer/domain/services/componentDiagnostics.js';

function pboSignal(i) {
  return {
    signal_type: 'active_information_seeking',
    source_type: 'pbo',
    intensity: 'moderate',
    evidence: `PBO signal ${i}`,
  };
}

function digitalSignal(i) {
  return {
    signal_type: 'deepfake_misinformation',
    source_type: 'news',
    intensity: 'moderate',
    evidence: `News signal ${i}`,
  };
}

describe('componentDiagnostics', () => {
  it('April 3 mixed: PBO scoring + quarantined digital + specialist skipped', () => {
    const scoringUsed = Array.from({ length: 57 }, (_, i) => pboSignal(i));
    const quarantined = Array.from({ length: 143 }, (_, i) => digitalSignal(i));

    const partitions = buildEvidencePartitionsByComponent({
      signalsForScoring: scoringUsed,
      quarantinedSignals: quarantined,
      scopedSignals: [...scoringUsed, ...quarantined],
      assessmentMode: 'field_anchor_only',
    });

    const infoPart = partitions.information_communication;
    assert.equal(infoPart.scoring_used, 57);
    assert.equal(infoPart.quarantined, 143);
    assert.ok(infoPart.field_anchor_used > 0);

    const comp = {
      component_id: 'information_communication',
      severity: 'abstain',
      confidence: 'low',
      operator_status: 'insufficient_data',
      narrative_claims: [],
      specialist_tier: 'C',
      specialist_ran: false,
    };

    const diagnostics = buildSingleComponentDiagnostics(comp, partitions, {
      assessmentMode: 'field_anchor_only',
      epistemicProfileAvailable: true,
      specialistSelectedSet: new Set(['leadership', 'narrative', 'lifesaving_behavior', 'functional_continuity']),
      degradeReason: null,
    });

    assert.equal(diagnostics.assessment_state, 'specialist_skipped');
    assert.ok(['field_anchor_only', 'mixed'].includes(diagnostics.evidence_usage_state));
    assert.equal(diagnostics.operator_display_state, 'specialist_skipped');
    assert.notEqual(diagnostics.operator_display_state, 'evidence_quarantined');
    assert.equal(diagnostics.coverage.scoring_used, 57);
    assert.equal(diagnostics.coverage.quarantined, 143);
  });

  it('true empty → insufficient_data', () => {
    const partitions = buildEvidencePartitionsByComponent({});
    const comp = {
      component_id: 'leadership',
      severity: 'abstain',
      confidence: 'low',
      narrative_claims: [],
      specialist_ran: false,
    };
    const diagnostics = buildSingleComponentDiagnostics(comp, partitions, {
      epistemicProfileAvailable: true,
      specialistSelectedSet: new Set(),
    });
    assert.equal(diagnostics.assessment_state, 'insufficient_data');
    assert.equal(diagnostics.operator_display_state, 'insufficient_data');
  });

  it('claims + abstain severity → invalid_artifact', () => {
    const state = deriveAssessmentState(
      {
        severity: 'abstain',
        operator_status: 'insufficient_data',
        confidence: 'medium',
      },
      { claims_count: 2, coverage: { scoring_used: 5 }, critic_downgraded: false },
      { epistemicProfileAvailable: true },
    );
    assert.equal(state.state, 'invalid_artifact');
    assert.ok(state.analystFlags.includes('contract_inconsistent'));
  });

  it('missing epistemic profile → diagnostic_incomplete flag', () => {
    const partitions = buildEvidencePartitionsByComponent({});
    const diagnostics = buildSingleComponentDiagnostics(
      { component_id: 'narrative', narrative_claims: [], specialist_ran: false },
      partitions,
      { epistemicProfileAvailable: false, specialistSelectedSet: new Set() },
    );
    assert.ok(diagnostics.analyst_flags.includes('diagnostic_incomplete'));
  });

  it('acceptance #6: scoring_used > 0 and claims=0 must not be insufficient_data', () => {
    const partitions = buildEvidencePartitionsByComponent({
      signalsForScoring: [pboSignal(0), pboSignal(1)],
    });
    const diagnostics = buildSingleComponentDiagnostics(
      {
        component_id: 'information_communication',
        narrative_claims: [],
        specialist_ran: false,
        specialist_tier: 'C',
      },
      partitions,
      { epistemicProfileAvailable: true, specialistSelectedSet: new Set(['leadership']) },
    );
    assert.notEqual(diagnostics.assessment_state, 'insufficient_data');
    assert.equal(diagnostics.assessment_state, 'specialist_skipped');
  });

  it('acceptance #7: tier C + scoring_used → specialist_skipped', () => {
    const partitions = buildEvidencePartitionsByComponent({
      signalsForScoring: Array.from({ length: 10 }, (_, i) => pboSignal(i)),
    });
    const diagnostics = buildSingleComponentDiagnostics(
      {
        component_id: 'information_communication',
        specialist_tier: 'C',
        specialist_ran: false,
        narrative_claims: [],
      },
      partitions,
      {
        epistemicProfileAvailable: true,
        specialistSelectedSet: new Set(['leadership']),
        assessmentMode: 'field_anchor_only',
      },
    );
    assert.equal(diagnostics.assessment_state, 'specialist_skipped');
  });

  it('quarantine-only evidence → evidence_quarantined display', () => {
    const partitions = buildEvidencePartitionsByComponent({
      quarantinedSignals: [digitalSignal(0), digitalSignal(1)],
      assessmentMode: 'field_anchor_only',
    });
    const diagnostics = buildSingleComponentDiagnostics(
      {
        component_id: 'information_communication',
        specialist_ran: false,
        narrative_claims: [],
      },
      partitions,
      { epistemicProfileAvailable: true, specialistSelectedSet: new Set(), assessmentMode: 'field_anchor_only' },
    );
    assert.equal(diagnostics.operator_display_state, 'evidence_quarantined');
  });

  it('assessed claims with low confidence → assessed_low_confidence', () => {
    const display = deriveOperatorDisplayState('assessed_low_confidence', 'normal', {
      claims_count: 2,
      critic_downgraded: true,
      coverage: { scoring_used: 5 },
    });
    assert.equal(display.state, 'assessed_low_confidence');
    assert.equal(display.reason, 'critic_downgraded');
  });

  it('component ID normalization flags unknown ids', () => {
    const unknown = findUnknownComponentIds({
      scoreBySource: { pbo: { community_resources: { signals: [] } } },
      epistemicProfile: { by_component: { wellbeing_at_risk: {} } },
      components: [{ component_id: 'leadership' }],
    });
    assert.deepEqual(unknown, ['community_resources']);
    for (const id of COMPONENT_IDS) {
      assert.ok(!unknown.includes(id));
    }
  });

  it('attachComponentDiagnostics merges onto assessment components', () => {
    const assessment = {
      components: COMPONENT_IDS.map((id) => ({
        component_id: id,
        severity: 'abstain',
        confidence: 'low',
        narrative_claims: [],
        specialist_ran: false,
        specialist_tier: 'C',
      })),
      investigation_plan: {
        focus_components: ['leadership'],
        abstention_components: [],
      },
    };

    attachComponentDiagnostics(assessment, {
      scoring: {
        signalsForScoring: Array.from({ length: 57 }, (_, i) => pboSignal(i)),
        macroSignals: [],
        quarantinedSignals: Array.from({ length: 20 }, (_, i) => digitalSignal(i)),
        scoringPartition: {
          quarantinedSignals: Array.from({ length: 20 }, (_, i) => digitalSignal(i)),
        },
        scopedSignals: [],
        assessmentMode: 'field_anchor_only',
      },
      scoreBySource: {},
      epistemicProfile: {
        by_component: Object.fromEntries(
          COMPONENT_IDS.map((id) => [id, { signal_count: id === 'information_communication' ? 57 : 0 }]),
        ),
      },
      investigationPlan: assessment.investigation_plan,
    });

    const info = assessment.components.find((c) => c.component_id === 'information_communication');
    assert.equal(info.operator_display_state, 'specialist_skipped');
    assert.equal(info.coverage.scoring_used, 57);
    assert.ok(assessment.component_diagnostics.information_communication);
  });
});
