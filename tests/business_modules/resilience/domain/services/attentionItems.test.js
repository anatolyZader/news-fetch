import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAttentionItems,
  ATTENTION_LEVELS,
} from '../../../../../business_modules/resilience/domain/services/attentionItems.js';
import { DISPLAY_VIEWS } from '../../../../../business_modules/resilience/domain/services/assessmentDisplayTier.js';

describe('attentionItems', () => {
  it('returns empty for null assessment', () => {
    assert.deepEqual(buildAttentionItems(null), []);
  });

  it('includes critical data void and sorts before warnings', () => {
    const items = buildAttentionItems({
      data_void: { level: 'critical', digital_darkness: true, reason: 'digital_darkness' },
      assessment_mode: 'field_anchor_only',
      components: [],
    }, { view: DISPLAY_VIEWS.operator });

    assert.ok(items.some((i) => i.code === 'digital_darkness' && i.level === 'critical'));
    assert.ok(items.some((i) => i.code === 'field_anchor_only' && i.level === 'warning'));
    assert.ok(ATTENTION_LEVELS[items[0].level] <= ATTENTION_LEVELS[items[1].level]);
  });

  it('includes sampling blind abstention as critical', () => {
    const items = buildAttentionItems({
      assessment_mode: 'abstained',
      epistemic_status: { sampling_status: 'blind' },
      components: [],
    });
    assert.ok(items.some((i) => i.code === 'sampling_blind' && i.level === 'critical'));
  });

  it('derives component salience critical from instrument', () => {
    const items = buildAttentionItems({
      components: [{
        component_id: 'lifesaving_behavior',
        instrument: {
          thin_evidence_instrument: 'critical_single_signal',
          salience_critical: true,
        },
      }],
    });
    const hit = items.find((i) => i.component_id === 'lifesaving_behavior');
    assert.equal(hit?.level, 'critical');
    assert.equal(hit?.code, 'critical_single_signal');
  });

  it('includes contested adequate-mass attention item', () => {
    const items = buildAttentionItems({
      components: [{
        component_id: 'narrative',
        instrument: { contested: true, contested_thin: false, evidence_sufficiency: 'adequate' },
      }],
    });
    assert.ok(items.some((i) => i.code === 'contested_evidence'));
  });

  it('includes pending operator recommendation items', () => {
    const items = buildAttentionItems({
      operator_recommendations: [{
        id: 'rec:information_vacuum_rumor',
        pattern_code: 'information_vacuum_rumor',
        level: 'warning',
        status: 'pending',
        title_key: 'attention.pattern.informationVacuumRumor',
      }],
      components: [],
    });
    assert.ok(items.some((i) => i.recommendation_id === 'rec:information_vacuum_rumor'));
  });

  it('includes oov_burst for operator when alert', () => {
    const items = buildAttentionItems({
      oov_burst: {
        alert: true,
        level: 'critical',
        total: 6,
        top_cluster_count: 2,
        top_cluster_keywords: ['drone', 'insulin'],
        window_hours: 2,
      },
      components: [],
    }, { view: DISPLAY_VIEWS.operator });
    assert.ok(items.some((i) => i.code === 'oov_burst' && i.level === 'critical'));
  });

  it('filters analyst-only items for operator view', () => {
    const assessment = {
      oov_capture_count: 5,
      methodology: { calibration: { deficit: 0.6, trust: 0.4 } },
      components: [{
        component_id: 'narrative',
        delta_significance: 2.5,
        z_score_chronic: -2.5,
        erosion_index: 0.4,
      }],
    };

    const operatorItems = buildAttentionItems(assessment, { view: DISPLAY_VIEWS.operator });
    const analystItems = buildAttentionItems(assessment, { view: DISPLAY_VIEWS.analyst });

    assert.ok(!operatorItems.some((i) => i.code === 'oov_capture'));
    assert.ok(!operatorItems.some((i) => i.code === 'calibration_deficit'));
    assert.ok(!operatorItems.some((i) => i.code === 'long_term_degradation'));

    assert.ok(analystItems.some((i) => i.code === 'oov_capture'));
    assert.ok(analystItems.some((i) => i.code === 'calibration_deficit'));
    assert.ok(analystItems.some((i) => i.code === 'long_term_degradation'));
  });

  it('includes macro signal count as info', () => {
    const items = buildAttentionItems({
      macro_signals_summary: { count: 3 },
      components: [],
    });
    assert.ok(items.some((i) => i.code === 'macro_signals' && i.level === 'info'));
  });
});
