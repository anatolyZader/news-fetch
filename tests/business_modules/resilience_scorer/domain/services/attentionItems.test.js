import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAttentionItems,
  annotateAttentionNovelty,
  applyDecisionBriefPriority,
  sortAttentionItems,
  ATTENTION_LEVELS,
  ATTENTION_KINDS,
} from '../../../../../business_modules/resilience_scorer/domain/services/user/attentionItems.js';
import { DISPLAY_VIEWS } from '../../../../../business_modules/resilience_scorer/domain/services/user/assessmentDisplayTier.js';

describe('attentionItems', () => {
  it('returns empty for null assessment', () => {
    assert.deepEqual(buildAttentionItems(null), []);
  });

  it('includes critical data void and sorts before warnings', () => {
    const items = buildAttentionItems({
      data_void: { level: 'critical', digital_darkness: true, reason: 'digital_darkness' },
      assessment_mode: 'field_anchor_only',
      components: [],
    }, { view: DISPLAY_VIEWS.user });

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

  it('includes pending user recommendation items', () => {
    const items = buildAttentionItems({
      user_recommendations: [{
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

  it('includes oov_burst for user when alert', () => {
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
    }, { view: DISPLAY_VIEWS.user });
    assert.ok(items.some((i) => i.code === 'oov_burst' && i.level === 'critical'));
  });

  it('filters developer-only items for user view', () => {
    const assessment = {
      oov_capture_count: 5,
      methodology: { calibration: { deficit: 0.6, trust: 0.4 } },
      components: [{ component_id: 'narrative' }],
    };

    const userItems = buildAttentionItems(assessment, { view: DISPLAY_VIEWS.user });
    const developerItems = buildAttentionItems(assessment, { view: DISPLAY_VIEWS.developer });

    assert.ok(!userItems.some((i) => i.code === 'oov_capture'));
    assert.ok(!userItems.some((i) => i.code === 'calibration_deficit'));

    assert.ok(developerItems.some((i) => i.code === 'oov_capture'));
    assert.ok(developerItems.some((i) => i.code === 'calibration_deficit'));
  });

  it('includes macro signal count as info', () => {
    const items = buildAttentionItems({
      macro_signals_summary: { count: 3 },
      components: [],
    });
    assert.ok(items.some((i) => i.code === 'macro_signals' && i.level === 'info'));
  });

  it('surfaces pattern alerts with channels when no pending recommendation covers them', () => {
    const items = buildAttentionItems({
      components: [],
      pattern_alerts: [{
        id: 'pattern:official_local_conflict',
        pattern_code: 'official_local_conflict',
        level: 'critical',
        component_id: 'information_communication',
        title_key: 'attention.pattern.officialLocalConflict',
        evidence_refs: [{ signal_type: 'rumor_spread' }, { signal_type: 'information_confusion' }],
        recommended_action: { type: 'comms_clarification', channels: ['civil_defense', 'local_whatsapp'] },
      }],
    });
    const hit = items.find((i) => i.code === 'official_local_conflict');
    assert.ok(hit);
    assert.deepEqual(hit.channels, ['civil_defense', 'local_whatsapp']);
    assert.equal(hit.evidence_count, 2);
    assert.equal(hit.kind, ATTENTION_KINDS.tasking);
  });

  it('does not double-list a pattern already covered by a pending recommendation', () => {
    const items = buildAttentionItems({
      components: [],
      user_recommendations: [{
        id: 'rec:active_rumor_cluster',
        pattern_code: 'active_rumor_cluster',
        level: 'watch',
        status: 'pending',
        title_key: 'attention.pattern.activeRumorCluster',
        recommended_action: { channels: ['local_whatsapp', 'social'] },
      }],
      pattern_alerts: [{
        id: 'pattern:active_rumor_cluster',
        pattern_code: 'active_rumor_cluster',
        level: 'watch',
        title_key: 'attention.pattern.activeRumorCluster',
      }],
    });
    const matches = items.filter((i) => i.code === 'active_rumor_cluster');
    assert.equal(matches.length, 1);
    assert.ok(matches[0].id.startsWith('recommendation:'));
    assert.deepEqual(matches[0].channels, ['local_whatsapp', 'social']);
  });

  it('assigns kind per code', () => {
    const items = buildAttentionItems({
      data_void: { level: 'critical', digital_darkness: true },
      components: [{
        component_id: 'lifesaving_behavior',
        instrument: { thin_evidence_instrument: 'critical_single_signal' },
      }],
    });
    const epistemic = items.find((i) => i.code === 'digital_darkness');
    const situational = items.find((i) => i.code === 'critical_single_signal');
    assert.equal(epistemic.kind, ATTENTION_KINDS.epistemic);
    assert.equal(situational.kind, ATTENTION_KINDS.situational);
  });

  it('collapses multiple component-instrument items into one with sub_codes', () => {
    const items = buildAttentionItems({
      components: [{
        component_id: 'narrative',
        instrument: {
          thin_evidence_instrument: 'critical_single_signal',
          contested: true,
          contested_thin: false,
          evidence_sufficiency: 'adequate',
        },
      }],
    });
    const narrativeItems = items.filter((i) => i.component_id === 'narrative');
    assert.equal(narrativeItems.length, 1);
    // critical_single_signal (critical) wins over contested_evidence (watch)
    assert.equal(narrativeItems[0].code, 'critical_single_signal');
    assert.deepEqual(narrativeItems[0].sub_codes, ['contested_evidence']);
  });

  it('sorts situational above epistemic at equal level', () => {
    const items = buildAttentionItems({
      data_void: { level: 'elevated', reason: 'drop' },
      components: [{
        component_id: 'lifesaving_behavior',
        instrument: { thin_evidence_instrument: 'unverified_alert' },
      }],
    });
    const warnings = items.filter((i) => i.level === 'warning');
    const situIdx = warnings.findIndex((i) => i.kind === ATTENTION_KINDS.situational);
    const epiIdx = warnings.findIndex((i) => i.kind === ATTENTION_KINDS.epistemic);
    assert.ok(situIdx >= 0 && epiIdx >= 0);
    assert.ok(situIdx < epiIdx);
  });
});

describe('annotateAttentionNovelty', () => {
  it('marks absent items new, present items ongoing, and more-severe items escalating', () => {
    const current = [
      { id: 'a', level: 'warning' },
      { id: 'b', level: 'critical' },
      { id: 'c', level: 'critical' },
    ];
    const prior = [
      { id: 'a', level: 'warning' },
      { id: 'c', level: 'warning' },
    ];
    annotateAttentionNovelty(current, prior);
    assert.equal(current.find((i) => i.id === 'a').novelty, 'ongoing');
    assert.equal(current.find((i) => i.id === 'b').novelty, 'new');
    assert.equal(current.find((i) => i.id === 'c').novelty, 'escalating');
  });
});

describe('applyDecisionBriefPriority', () => {
  it('annotates matches by attention_id and recommendation_id and synthesizes unmatched', () => {
    const items = [
      { id: 'x', level: 'warning', code: 'thin_evidence' },
      { id: 'recommendation:rec:y', level: 'watch', code: 'active_rumor_cluster', recommendation_id: 'rec:y' },
    ];
    const brief = {
      priority_items: [
        { attention_id: 'x', rationale: 'r1', suggested_next_step: 's1', level: 'warning' },
        { recommendation_id: 'rec:y', rationale: 'r2', suggested_next_step: 's2', level: 'watch' },
        { attention_id: 'missing', rationale: 'r3', suggested_next_step: 's3', level: 'critical' },
      ],
    };
    const result = sortAttentionItems(applyDecisionBriefPriority(items, brief));
    const x = result.find((i) => i.id === 'x');
    const y = result.find((i) => i.id === 'recommendation:rec:y');
    const synthesized = result.find((i) => i.id === 'brief:missing');
    assert.equal(x.brief_rank, 0);
    assert.equal(x.brief_rationale, 'r1');
    assert.equal(y.brief_rank, 1);
    assert.equal(synthesized.brief_rank, 2);
    assert.equal(synthesized.kind, ATTENTION_KINDS.tasking);
    // brief items float to the head regardless of level
    assert.equal(result[0].id, 'x');
  });

  it('returns items unchanged when no brief priority items', () => {
    const items = [{ id: 'x', level: 'warning', code: 'thin_evidence' }];
    assert.equal(applyDecisionBriefPriority(items, null).length, 1);
    assert.equal(applyDecisionBriefPriority(items, { priority_items: [] }).length, 1);
  });
});

function componentsWith(claims) {
  return Array.from({ length: 8 }, (_, i) => ({
    component_id: `c${i}`,
    assessment_state: 'specialist_skipped',
    narrative_claims: claims,
  }));
}

function codes(assessment) {
  return (buildAttentionItems(assessment, { view: DISPLAY_VIEWS.developer }) ?? []).map((i) => i.code);
}

describe('attentionItems — empty assessment', () => {
  it('flags a full signal bundle that produced no claims at all', () => {
    const items = buildAttentionItems(
      { scoped_signal_count: 782, components: componentsWith([]) },
      { view: DISPLAY_VIEWS.developer },
    );
    const empty = items.find((i) => i.code === 'assessment_empty');
    assert.ok(empty, 'expected assessment_empty');
    assert.equal(empty.level, 'critical');
    assert.equal(empty.kind, ATTENTION_KINDS.pipeline);
    assert.equal(empty.detail_params.skipped, 8);
  });

  it('stays silent on a genuinely thin day', () => {
    assert.ok(!codes({ scoped_signal_count: 23, components: componentsWith([]) }).includes('assessment_empty'));
  });

  it('stays silent when claims exist', () => {
    assert.ok(!codes({
      scoped_signal_count: 782,
      components: componentsWith([{ text: 'x', signal_refs: ['a@idx:1'] }]),
    }).includes('assessment_empty'));
  });

  it('does not guess volume from per-component counts, which double-count', () => {
    // 8 components x 20 signals each is at most 20 distinct signals, not 160.
    const components = componentsWith([]).map((c) => ({ ...c, signal_count: 20 }));
    assert.ok(!codes({ components }).includes('assessment_empty'));
  });
});
