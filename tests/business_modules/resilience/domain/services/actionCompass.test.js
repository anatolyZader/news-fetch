import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildActionCompass } from '../../../../../business_modules/resilience/domain/services/actionCompass.js';
import { ACTION_KINDS } from '../../../../../business_modules/resilience/domain/services/actionCompassKinds.js';
import { buildAttentionItems } from '../../../../../business_modules/resilience/domain/services/attentionItems.js';

describe('buildActionCompass', () => {
  it('returns a corroborate action for abstained assessment without scores', () => {
    const assessment = {
      assessment_mode: 'abstained',
      epistemic_status: { sampling_status: 'blind', assessment_mode: 'abstained' },
      data_void: { level: 'critical', digital_darkness: true, information_vacuum_index: 0.9 },
      components: [{
        component_id: 'lifesaving_behavior',
        instrument: { operator_shows_score: false, thin_evidence_instrument: 'sampling_blind' },
      }],
    };
    const attention = buildAttentionItems(assessment, { view: 'operator' });
    const compass = buildActionCompass(assessment, attention);
    assert.ok(compass);
    assert.equal(compass.uncertainty_band, 'critical');
    assert.ok(compass.actions.some((a) => a.kind === ACTION_KINDS.corroborate));
    const blob = JSON.stringify(compass);
    assert.doesNotMatch(blob, /"score":\s*\d/);
    assert.doesNotMatch(blob, /\/10/);
  });

  it('does not leak internal field names into operator output', () => {
    const assessment = {
      assessment_mode: 'abstained',
      epistemic_status: { sampling_status: 'blind', assessment_mode: 'abstained' },
      data_void: { level: 'critical', digital_darkness: true, reason: 'digital_darkness', information_vacuum_index: 0.9 },
      components: [],
    };
    const attention = buildAttentionItems(assessment, { view: 'operator' });
    const compass = buildActionCompass(assessment, attention);
    const blob = JSON.stringify(compass);
    assert.doesNotMatch(blob, /vacuum_index/);
    assert.doesNotMatch(blob, /digital_darkness=/);
    assert.doesNotMatch(blob, /reason=/);
  });

  it('includes a geo allocate action when geoUnknownCount > 0', () => {
    const assessment = {
      assessment_mode: 'normal',
      epistemic_status: { sampling_status: 'normal' },
      data_void: { level: 'none' },
      components: [],
    };
    const compass = buildActionCompass(assessment, [], { geoUnknownCount: 3 });
    assert.ok(compass);
    const geo = compass.actions.find((a) => a.id === 'compass:geo:unknown');
    assert.ok(geo);
    assert.equal(geo.kind, ACTION_KINDS.allocate);
  });

  it('returns null when no actions and band unknown', () => {
    const assessment = {
      assessment_mode: 'normal',
      epistemic_status: { sampling_status: 'normal' },
      components: [{ component_id: 'narrative', instrument: { operator_shows_score: true } }],
    };
    const compass = buildActionCompass(assessment, []);
    assert.equal(compass, null);
  });

  it('drops info-noise (macro signals) so it never crowds out actions', () => {
    const assessment = {
      assessment_mode: 'normal',
      epistemic_status: { sampling_status: 'normal' },
      data_void: { level: 'none' },
      components: [{ component_id: 'narrative', instrument: { operator_shows_score: true } }],
      macro_signals: new Array(9).fill({ id: 'm' }),
    };
    const attention = buildAttentionItems(assessment, { view: 'operator' });
    assert.ok(attention.some((i) => i.code === 'macro_signals'));
    const compass = buildActionCompass(assessment, attention);
    assert.equal(compass, null);
  });

  it('clusters duplicate digital-void diagnostics into a single corroborate action', () => {
    const assessment = {
      assessment_mode: 'abstained',
      epistemic_status: { sampling_status: 'blind', assessment_mode: 'abstained' },
      data_void: { level: 'critical', digital_darkness: true },
      digital_quarantine_state: { active: true, reason: 'digital_darkness', since: '2026-06-13T13:33:15.877Z' },
      components: [],
    };
    const attention = buildAttentionItems(assessment, { view: 'operator' });
    const compass = buildActionCompass(assessment, attention);
    const corroborate = compass.actions.filter((a) => a.kind === ACTION_KINDS.corroborate);
    assert.equal(corroborate.length, 1);
  });

  it('caps any single kind at 2 under kind-diversity selection', () => {
    const assessment = {
      assessment_mode: 'normal',
      epistemic_status: { sampling_status: 'normal' },
      data_void: {
        level: 'critical',
        digital_darkness: true,
        affected_clusters: [{ cluster: 'kiryat_shmona', reason: 'cluster_digital_darkness', field_volume: 2, digital_volume: 0 }],
      },
      oov_burst: {
        alert: true,
        level: 'warning',
        total: 5,
        top_cluster_key: 'x',
        top_cluster_count: 3,
        top_cluster_keywords: ['boom', 'siren'],
      },
      components: [
        { component_id: 'a', instrument: { contested: true } },
        { component_id: 'b', instrument: { contested: true } },
        { component_id: 'c', instrument: { contested: true } },
      ],
    };
    const attention = buildAttentionItems(assessment, { view: 'operator' });
    const compass = buildActionCompass(assessment, attention);
    const investigate = compass.actions.filter((a) => a.kind === ACTION_KINDS.investigate);
    assert.ok(investigate.length <= 2, `expected <=2 investigate, got ${investigate.length}`);
    assert.ok(compass.actions.length <= 5);
    assert.ok(compass.actions.some((a) => a.kind === ACTION_KINDS.allocate));
    assert.ok(compass.actions.some((a) => a.kind === ACTION_KINDS.communicate));
  });

  it('collapses systemic source-mix gaps across components into one investigate action', () => {
    const assessment = {
      assessment_mode: 'normal',
      epistemic_status: { sampling_status: 'degraded' },
      data_void: { level: 'warning' },
      components: [],
      investigation_plan: {
        gap_closure_tasks: [
          { gap_id: 'narrative:div', component_id: 'narrative', gap_type: 'investigation', action: 'diversify sources: source_type "pbo" over-represented' },
          { gap_id: 'info:div', component_id: 'information_communication', gap_type: 'investigation', action: 'diversify sources: source_type "pbo" over-represented' },
          { gap_id: 'life:div', component_id: 'lifesaving_behavior', gap_type: 'investigation', action: 'diversify sources: source_type "pbo" over-represented' },
        ],
      },
    };
    const attention = buildAttentionItems(assessment, { view: 'operator' });
    const compass = buildActionCompass(assessment, attention);
    const sourceMix = compass.actions.filter(
      (a) => /diversify sources|over-represented/i.test(a.suggested_next_step ?? ''),
    );
    assert.equal(sourceMix.length, 1);
    assert.equal(sourceMix[0].component_id, null);
  });

  it('carries brief suggested_next_step and success_signal through', () => {
    const assessment = {
      assessment_mode: 'normal',
      epistemic_status: { sampling_status: 'degraded' },
      data_void: { level: 'warning' },
      components: [],
      decision_brief: {
        priority_items: [{
          level: 'warning',
          rationale: 'Field corroboration needed for Kiryat Shmona.',
          suggested_next_step: 'Contact the field team for Kiryat Shmona.',
          success_signal: 'Field team confirms status.',
        }],
      },
    };
    const attention = buildAttentionItems(assessment, { view: 'operator' });
    const compass = buildActionCompass(assessment, attention);
    const brief = compass.actions.find((a) => a.suggested_next_step === 'Contact the field team for Kiryat Shmona.');
    assert.ok(brief);
    assert.equal(brief.success_signal_text, 'Field team confirms status.');
    assert.equal(brief.why_now_text, 'Field corroboration needed for Kiryat Shmona.');
  });
});
