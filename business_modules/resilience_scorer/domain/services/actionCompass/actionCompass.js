/**
 * Action compass — ranked user actions during abstention/uncertainty (no numeric scores).
 *
 * Pipeline position: STAGE-2 assess finalize — collects candidates from attention,
 * recommendations, brief, gaps, and void/geo signals; ranks and phrases top actions.
 *
 * Owns: candidate collection, semantic dedupe clustering, uncertainty band derivation,
 * final compass payload on the assessment.
 * Does NOT: detect patterns (see `patternDetection/`) or compute component scores
 * (min-math — count-based evidence only).
 *
 * Key collaborators: `actionCompass/actionCompassKinds.js`, `actionCompass/actionCompassRanking.js`,
 * `actionCompass/actionCompassPhrasing.js`, `services/user/attentionItems.js`.
 *
 * Pipeline: collect candidates → drop info-noise → classify KINDS → cluster duplicates →
 * value-rank → kind-diversity select top 5 → user-language phrasing.
 */

import { THIN_EVIDENCE_INSTRUMENT } from '../../epistemic/thinEvidencePolicy.js';
import { isSoftVoidWarning } from '../../contracts/softVoidReasons.js';
import { classifyKind, isInfoNoise } from './actionCompassKinds.js';
import { scoreAction, selectWithKindDiversity } from './actionCompassRanking.js';
import { buildGroundingContext } from './actionCompassGrounding.js';
import { phraseAction } from './actionCompassPhrasing.js';

export { ATTENTION_LEVELS } from '../user/attentionItems.js';
export { ACTION_KINDS } from './actionCompassKinds.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LEVEL_PRIORITY = { critical: 0, warning: 1, watch: 2, info: 3 };
const MAX_ACTIONS = 5;

/** Novelty hints by attention code (drives ranking + monitor vs repair split). */
const CODE_NOVELTY = {
  persisted_digital_quarantine: 'persisted',
  field_anchor_only: 'persisted',
  abstention_fatigue: 'persisted',
  digital_darkness: 'new',
  sampling_blind: 'new',
  quarantined_digital: 'new',
  oov_burst: 'new',
};

/**
 * Whether the action compass panel is enabled (`RESILIENCE_ACTION_COMPASS` defaults on).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function actionCompassEnabled(env = process.env) {
  return env.RESILIENCE_ACTION_COMPASS !== '0';
}

// ---------------------------------------------------------------------------
// Uncertainty band
// ---------------------------------------------------------------------------

/**
 * Derive uncertainty band from data void and epistemic status (no numeric score).
 * @param {object|null|undefined} dataVoid
 * @param {object|null|undefined} epistemicStatus
 * @returns {'unknown'|'watch'|'elevated'|'critical'}
 */
export function deriveUncertaintyBand(dataVoid, epistemicStatus) {
  const voidLevel = dataVoid?.level ?? 'none';
  const sampling = epistemicStatus?.sampling_status ?? 'normal';
  const mode = epistemicStatus?.assessment_mode ?? 'normal';

  if (sampling === 'blind' || mode === 'abstained' || voidLevel === 'critical' || dataVoid?.digital_darkness === true) {
    return 'critical';
  }
  if (voidLevel === 'elevated') return 'elevated';
  if (voidLevel === 'warning' || sampling === 'degraded') return 'watch';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Candidate collection (internal)
// ---------------------------------------------------------------------------

/**
 * Gather raw candidates from all sources into a uniform shape.
 * @param {object} assessment
 * @param {Array<object>} attentionItems
 * @param {string} band
 * @param {number} geoUnknownCount
 * @returns {Array<object>}
 */
function collectCandidates(assessment, attentionItems, band, geoUnknownCount) {
  const candidates = [];
  const dataVoid = assessment?.data_void ?? null;

  const sortedAttention = [...(attentionItems ?? [])].sort((a, b) => {
    const la = LEVEL_PRIORITY[a.level] ?? 99;
    const lb = LEVEL_PRIORITY[b.level] ?? 99;
    return la - lb;
  });
  for (const it of sortedAttention.slice(0, 8)) {
    if (isInfoNoise(it.code)) continue;
    if (it.code === 'data_void_drop' && isSoftVoidWarning(dataVoid)) continue;
    candidates.push({
      id: `compass:attention:${it.id}`,
      source: 'attention',
      code: it.code ?? null,
      level: it.level ?? 'watch',
      component_id: it.component_id ?? null,
      suggested_action_key: it.suggested_action_key ?? null,
      developer_detail: it.detail_params ?? {},
      novelty: CODE_NOVELTY[it.code] ?? null,
    });
  }

  const pendingRecs = (assessment.user_recommendations ?? []).filter((r) => r.status === 'pending');
  for (const rec of pendingRecs.slice(0, 4)) {
    candidates.push({
      id: `compass:rec:${rec.id}`,
      source: 'recommendation',
      code: rec.pattern_code ?? null,
      level: rec.level ?? 'watch',
      component_id: rec.component_id ?? null,
      suggested_action_key: rec.suggested_action_key ?? 'attention.suggested.reviewEvidence',
      developer_detail: rec.detail_params ?? {},
      novelty: 'new',
    });
  }

  const briefItems = assessment.decision_brief?.priority_items ?? [];
  for (const [i, briefItem] of briefItems.slice(0, 4).entries()) {
    const rationale = String(briefItem.rationale ?? '').slice(0, 280);
    candidates.push({
      id: `compass:brief:${briefItem.attention_id ?? briefItem.recommendation_id ?? i}`,
      source: 'brief',
      code: null,
      level: briefItem.level ?? 'watch',
      component_id: null,
      text: `${rationale} ${briefItem.suggested_next_step ?? ''}`,
      why_now_text: rationale,
      suggested_next_step: briefItem.suggested_next_step ?? null,
      success_text: briefItem.success_signal ?? null,
      novelty: 'new',
    });
  }

  const gapTasks = assessment.investigation_plan?.gap_closure_tasks ?? [];
  for (const [i, task] of gapTasks.slice(0, 4).entries()) {
    candidates.push({
      id: `compass:gap:${task.gap_id ?? task.id ?? i}`,
      source: 'gap',
      code: 'gap',
      level: 'watch',
      component_id: task.component_id ?? null,
      suggested_next_step: String(task.action ?? '').slice(0, 200) || null,
      suggested_action_key: 'actionCompass.investigateGap',
      novelty: 'new',
    });
  }

  if (band === 'critical') {
    candidates.push({
      id: 'compass:void:field',
      source: 'void',
      code: 'void_field',
      level: 'critical',
      component_id: null,
      novelty: 'new',
    });
    if ((assessment.assessment_mode ?? 'normal') === 'abstained') {
      candidates.push({
        id: 'compass:escalate',
        source: 'void',
        code: 'escalate_void',
        level: 'critical',
        component_id: null,
        novelty: 'new',
      });
    }
  }

  if (geoUnknownCount > 0) {
    candidates.push({
      id: 'compass:geo:unknown',
      source: 'void',
      code: 'geo_unknown',
      level: 'warning',
      component_id: null,
      suggested_action_key: 'actionCompass.reviewGeoUnknown',
      novelty: 'new',
    });
  }

  return candidates;
}

/**
 * A systemic source-mix dominance gap is report-wide regardless of component.
 * @param {object} c
 * @returns {boolean}
 */
function isSystemicSourceMixGap(c) {
  if (c.source !== 'gap') return false;
  const text = String(c.suggested_next_step ?? c.text ?? '');
  return /diversify sources|over-represented|mass cap/i.test(text);
}

/** Cluster key: systemic source-mix gaps collapse across components. */
function clusterKeyFor(c) {
  return isSystemicSourceMixGap(c)
    ? `${c.kind}:__source_mix__`
    : `${c.kind}:${c.component_id ?? ''}`;
}

/** Merge a duplicate candidate into the already-clustered entry (mutates existing). */
function mergeIntoExisting(existing, c) {
  if (c.code && !existing.evidence_codes.includes(c.code)) existing.evidence_codes.push(c.code);

  const moreSevere = (LEVEL_PRIORITY[c.level] ?? 99) < (LEVEL_PRIORITY[existing.level] ?? 99);
  if (moreSevere) {
    existing.level = c.level;
    existing.id = c.id;
    existing.source = c.source;
    existing.code = c.code ?? existing.code;
  }
  // carry verb-bearing fields from any member
  existing.suggested_next_step = existing.suggested_next_step ?? c.suggested_next_step ?? null;
  existing.why_now_text = existing.why_now_text ?? c.why_now_text ?? null;
  existing.success_text = existing.success_text ?? c.success_text ?? null;
  existing.suggested_action_key = existing.suggested_action_key ?? c.suggested_action_key ?? null;
  existing.developer_detail = existing.developer_detail ?? c.developer_detail;
  if (c.novelty === 'new') existing.novelty = 'new';
}

/**
 * Merge semantic duplicates by kind + component.
 * @param {Array<object>} candidates each already has `kind`
 * @returns {Array<object>}
 */
function clusterCandidates(candidates) {
  const byKey = new Map();
  let order = 0;

  for (const c of candidates) {
    const key = clusterKeyFor(c);
    const existing = byKey.get(key);
    if (existing) {
      mergeIntoExisting(existing, c);
      continue;
    }
    byKey.set(key, {
      ...c,
      // Systemic gap is report-wide, not component-scoped — drop component_id so
      // phrasing reads as one cross-cutting caveat.
      component_id: isSystemicSourceMixGap(c) ? null : c.component_id,
      evidence_codes: c.code ? [c.code] : [],
      _order: order++,
    });
  }

  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Compass builder
// ---------------------------------------------------------------------------

/**
 * Build the action compass panel for an assessment (or null when disabled/empty).
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

  const geoUnknownCount = opts.geoUnknownCount ?? 0;
  const ground = buildGroundingContext(assessment, { geoUnknownCount });

  const candidates = collectCandidates(assessment, attentionItems, uncertainty_band, geoUnknownCount);
  for (const c of candidates) {
    c.kind = classifyKind(c);
  }

  const merged = clusterCandidates(candidates);
  for (const action of merged) {
    action.ground = ground;
    action._score = scoreAction(action);
  }

  const selected = selectWithKindDiversity(merged, MAX_ACTIONS, { maxPerKind: 2 });

  const hasAbstention = (assessment.components ?? []).some((c) => {
    const inst = c.instrument?.thin_evidence_instrument ?? c.thin_evidence_instrument;
    return inst === THIN_EVIDENCE_INSTRUMENT.insufficient_data
      || inst === THIN_EVIDENCE_INSTRUMENT.sampling_blind
      || c.instrument?.user_shows_score === false;
  });

  if (selected.length === 0 && uncertainty_band === 'unknown' && !hasAbstention) {
    return null;
  }

  const actions = selected.map((action, index) => {
    const phrasing = phraseAction(action, ground);
    return {
      id: action.id,
      priority: index,
      level: action.level,
      kind: action.kind,
      component_id: action.component_id ?? null,
      source: action.source,
      title_key: phrasing.title_key,
      detail_params: phrasing.detail_params,
      title: {
        kind: 'i18n',
        key: phrasing.title_key,
        params: phrasing.detail_params ?? {},
      },
      why_now_key: action.why_now_text ? null : phrasing.why_now_key,
      why_now_params: phrasing.why_now_params,
      why_now_text: action.why_now_text ?? null,
      why_now: action.why_now_text
        ? { kind: 'text', value: action.why_now_text }
        : {
          kind: 'i18n',
          key: phrasing.why_now_key,
          params: phrasing.why_now_params ?? {},
        },
      success_signal_key: action.success_text ? null : phrasing.success_signal_key,
      success_signal_text: action.success_text ?? null,
      suggested_next_step: action.suggested_next_step ?? null,
      suggested_action_key: action.suggested_action_key ?? null,
    };
  });

  return {
    uncertainty_band,
    actions,
  };
}
