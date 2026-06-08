/**
 * Action compass — ranked operator actions during abstention/uncertainty (no numeric scores).
 */

import { ATTENTION_LEVELS } from './attentionItems.js';
import { THIN_EVIDENCE_INSTRUMENT } from './thinEvidencePolicy.js';

const LEVEL_PRIORITY = { critical: 0, warning: 1, watch: 2, info: 3 };

export function actionCompassEnabled(env = process.env) {
  return env.RESILIENCE_ACTION_COMPASS !== '0';
}

/**
 * @param {object|null|undefined} dataVoid
 * @param {object|null|undefined} epistemicStatus
 * @returns {'unknown'|'watch'|'elevated'|'critical'}
 */
export function deriveUncertaintyBand(dataVoid, epistemicStatus) {
  const voidLevel = dataVoid?.level ?? 'none';
  const sampling = epistemicStatus?.sampling_status ?? 'normal';
  const mode = epistemicStatus?.assessment_mode ?? epistemicStatus?.assessment_mode
    ?? 'normal';

  if (sampling === 'blind' || mode === 'abstained' || voidLevel === 'critical' || dataVoid?.digital_darkness === true) {
    return 'critical';
  }
  if (voidLevel === 'elevated') return 'elevated';
  if (voidLevel === 'warning' || sampling === 'degraded') return 'watch';
  return 'unknown';
}

/**
 * @param {object} entry
 * @param {number} priority
 */
function compassAction(entry, priority) {
  return { priority, ...entry };
}

/**
 * @param {object|null|undefined} assessment
 * @param {Array<object>} [attentionItems]
 * @param {{ geoUnknownCount?: number }} [opts]
 * @returns {{ uncertainty_band: string, actions: object[] }|null}
 */
export function buildActionCompass(assessment, attentionItems = [], opts = {}) {
  if (!actionCompassEnabled()) return null;
  if (!assessment || typeof assessment !== 'object') return null;

  const dataVoid = assessment.data_void ?? null;
  const epistemicStatus = assessment.epistemic_status ?? null;
  const assessmentMode = assessment.assessment_mode ?? 'normal';
  const uncertainty_band = deriveUncertaintyBand(dataVoid, {
    ...epistemicStatus,
    assessment_mode: assessmentMode,
  });

  const actions = [];
  const seen = new Set();
  let priority = 0;

  function push(entry) {
    if (!entry?.id || seen.has(entry.id)) return;
    seen.add(entry.id);
    actions.push(compassAction(entry, priority++));
  }

  const sortedAttention = [...(attentionItems ?? [])].sort((a, b) => {
    const la = LEVEL_PRIORITY[a.level] ?? 99;
    const lb = LEVEL_PRIORITY[b.level] ?? 99;
    return la - lb;
  });

  for (const it of sortedAttention.slice(0, 8)) {
    push({
      id: `compass:attention:${it.id}`,
      level: it.level,
      title_key: it.title_key,
      detail_key: it.detail_key ?? null,
      detail_params: it.detail_params ?? {},
      suggested_action_key: it.suggested_action_key ?? null,
      source: 'attention',
      component_id: it.component_id ?? null,
    });
  }

  const pendingRecs = (assessment.operator_recommendations ?? [])
    .filter((r) => r.status === 'pending');
  for (const rec of pendingRecs.slice(0, 4)) {
    push({
      id: `compass:rec:${rec.id}`,
      level: rec.level ?? 'watch',
      title_key: rec.title_key,
      detail_key: rec.detail_key ?? null,
      detail_params: rec.detail_params ?? {},
      suggested_action_key: rec.suggested_action_key ?? 'attention.suggested.reviewEvidence',
      source: 'recommendation',
      component_id: rec.component_id ?? null,
    });
  }

  const briefItems = assessment.decision_brief?.priority_items ?? [];
  for (const [i, item] of briefItems.slice(0, 4).entries()) {
    push({
      id: `compass:brief:${item.attention_id ?? item.recommendation_id ?? i}`,
      level: item.level ?? 'watch',
      title_key: 'actionCompass.briefItem',
      detail_key: null,
      detail_params: { rationale: String(item.rationale ?? '').slice(0, 200) },
      suggested_action_key: 'actionCompass.suggestedNextStep',
      source: 'brief',
      component_id: null,
      suggested_next_step: item.suggested_next_step ?? null,
    });
  }

  const gapTasks = assessment.investigation_plan?.gap_closure_tasks ?? [];
  for (const task of gapTasks.slice(0, 4)) {
    push({
      id: `compass:gap:${task.gap_id ?? task.id}`,
      level: 'watch',
      title_key: 'actionCompass.gapClosure',
      detail_key: null,
      detail_params: {
        component_id: task.component_id ?? '',
        action: String(task.action ?? '').slice(0, 200),
      },
      suggested_action_key: 'actionCompass.investigateGap',
      source: 'gap',
      component_id: task.component_id ?? null,
    });
  }

  if (uncertainty_band === 'critical' && !seen.has('compass:void:field')) {
    push({
      id: 'compass:void:field',
      level: 'critical',
      title_key: 'actionCompass.fieldCorroboration',
      detail_key: 'actionCompass.fieldCorroborationDetail',
      detail_params: {},
      suggested_action_key: 'attention.suggested.fieldCorroboration',
      source: 'void',
      component_id: null,
    });
  }

  if ((opts.geoUnknownCount ?? 0) > 0) {
    push({
      id: 'compass:geo:unknown',
      level: 'warning',
      title_key: 'actionCompass.geoUnknown',
      detail_key: 'actionCompass.geoUnknownDetail',
      detail_params: { count: opts.geoUnknownCount },
      suggested_action_key: 'actionCompass.reviewGeoUnknown',
      source: 'void',
      component_id: null,
    });
  }

  const hasAbstention = (assessment.components ?? []).some((c) => {
    const inst = c.instrument?.thin_evidence_instrument ?? c.thin_evidence_instrument;
    return inst === THIN_EVIDENCE_INSTRUMENT.insufficient_data
      || inst === THIN_EVIDENCE_INSTRUMENT.sampling_blind
      || c.instrument?.operator_shows_score === false;
  });

  if (actions.length === 0 && uncertainty_band === 'unknown' && !hasAbstention) {
    return null;
  }

  return {
    uncertainty_band,
    actions: actions.slice(0, 5),
  };
}

export { ATTENTION_LEVELS };
