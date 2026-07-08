/**
 * Derive unified attention items from a (possibly redacted) assessment for operator/analyst UI.
 */

import {
  addAbstentionFatigueItems,
  addClusterAttentionItems,
  addComponentAttentionItems,
  addDataVoidAttentionItems,
  addEpistemicAttentionItems,
  addGeoAttentionItems,
  addMacroAttentionItems,
  addOovAttentionItems,
  addOperatorRecommendationItems,
  addPatternAttentionItems,
  addSocialQuarantineAttentionItems,
  createAttentionPush,
  DISPLAY_VIEWS,
} from './attentionItemsHelpers.js';

export const ATTENTION_LEVELS = Object.freeze({
  critical: 0,
  warning: 1,
  watch: 2,
  info: 3,
});

/**
 * Orthogonal to severity: the *kind* of attention an item demands, so the panel
 * can group by intent (a substantive situation vs a trust caveat vs an action vs
 * analyst housekeeping) and the operator view can hide pipeline noise.
 */
export const ATTENTION_KINDS = Object.freeze({
  situational: 'situational',
  tasking: 'tasking',
  epistemic: 'epistemic',
  pipeline: 'pipeline',
});

const KIND_PRIORITY = Object.freeze({
  situational: 0,
  tasking: 1,
  epistemic: 2,
  pipeline: 3,
});

const NOVELTY_PRIORITY = Object.freeze({
  escalating: 0,
  new: 1,
  ongoing: 2,
});

/**
 * Map an item `code` to its attention kind. Codes not listed (pattern detections,
 * operator recommendations) are resolved via {@link kindForItem} fallback.
 */
const KIND_BY_CODE = Object.freeze({
  // Situational — something in the world changed / an emerging risk
  presence_gate: ATTENTION_KINDS.situational,
  critical_single_signal: ATTENTION_KINDS.situational,
  unverified_alert: ATTENTION_KINDS.situational,
  significant_delta: ATTENTION_KINDS.situational,
  high_delta_z: ATTENTION_KINDS.situational,
  long_term_degradation: ATTENTION_KINDS.situational,
  erosion_elevated: ATTENTION_KINDS.situational,
  oov_burst: ATTENTION_KINDS.situational,
  macro_signals: ATTENTION_KINDS.situational,
  // Tasking — a concrete action with a target/channel
  abstention_fatigue: ATTENTION_KINDS.tasking,
  decision_brief_priority: ATTENTION_KINDS.tasking,
  // Epistemic — how much to trust today's picture; what to corroborate
  digital_darkness: ATTENTION_KINDS.epistemic,
  data_void_drop: ATTENTION_KINDS.epistemic,
  affected_clusters: ATTENTION_KINDS.epistemic,
  sampling_blind: ATTENTION_KINDS.epistemic,
  field_anchor_only: ATTENTION_KINDS.epistemic,
  quarantined_digital: ATTENTION_KINDS.epistemic,
  persisted_digital_quarantine: ATTENTION_KINDS.epistemic,
  geo_quality_low: ATTENTION_KINDS.epistemic,
  thin_evidence: ATTENTION_KINDS.epistemic,
  contested_evidence: ATTENTION_KINDS.epistemic,
  osint_quarantine_auto: ATTENTION_KINDS.epistemic,
  social_quarantine_active: ATTENTION_KINDS.epistemic,
  social_quarantine_suggested: ATTENTION_KINDS.epistemic,
  // Pipeline — measurement/catalog housekeeping (analyst audience)
  oov_scoring_applied: ATTENTION_KINDS.pipeline,
  oov_capture: ATTENTION_KINDS.pipeline,
  calibration_deficit: ATTENTION_KINDS.pipeline,
});

/** Component-instrument codes that are collapsed into one item per component. */
const COMPONENT_INSTRUMENT_CODES = new Set([
  'presence_gate',
  'critical_single_signal',
  'unverified_alert',
  'significant_delta',
  'thin_evidence',
  'contested_evidence',
  'high_delta_z',
  'long_term_degradation',
  'erosion_elevated',
]);

/**
 * @param {'critical'|'warning'|'watch'|'info'} level
 * @param {string} id
 * @param {string} code
 * @param {string} titleKey
 * @param {object} [extra]
 */
function item(level, id, code, titleKey, extra = {}) {
  return {
    id,
    level,
    code,
    title_key: titleKey,
    ...extra,
  };
}

/**
 * @param {object} it
 * @returns {string}
 */
function kindForItem(it) {
  if (KIND_BY_CODE[it.code]) return KIND_BY_CODE[it.code];
  // Pattern detections and operator recommendations carry an actionable channel set.
  if (it.recommendation_id || (Array.isArray(it.channels) && it.channels.length > 0)) {
    return ATTENTION_KINDS.tasking;
  }
  return ATTENTION_KINDS.epistemic;
}

/**
 * Comparable urgency magnitude pulled from detail params / evidence, used as a
 * secondary sort key so larger shifts float above minor caveats at equal level.
 * @param {object} it
 * @returns {number}
 */
function magnitudeForItem(it) {
  const p = it.detail_params ?? {};
  if (typeof p.z === 'number') return Math.abs(p.z);
  if (typeof p.erosion === 'number') return p.erosion;
  if (typeof it.evidence_count === 'number' && it.evidence_count > 0) return it.evidence_count;
  if (typeof p.n === 'number') return p.n;
  if (typeof p.count === 'number') return p.count;
  return 0;
}

/**
 * @param {object} a
 * @param {object} b
 */
function compareAttentionItems(a, b) {
  const ra = a.brief_rank ?? Number.POSITIVE_INFINITY;
  const rb = b.brief_rank ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;

  const la = ATTENTION_LEVELS[a.level] ?? 99;
  const lb = ATTENTION_LEVELS[b.level] ?? 99;
  if (la !== lb) return la - lb;

  const ka = KIND_PRIORITY[a.kind] ?? 9;
  const kb = KIND_PRIORITY[b.kind] ?? 9;
  if (ka !== kb) return ka - kb;

  const ma = a.magnitude ?? 0;
  const mb = b.magnitude ?? 0;
  if (ma !== mb) return mb - ma;

  const na = NOVELTY_PRIORITY[a.novelty] ?? 9;
  const nb = NOVELTY_PRIORITY[b.novelty] ?? 9;
  if (na !== nb) return na - nb;

  const ca = a.component_id ?? '';
  const cb = b.component_id ?? '';
  if (ca !== cb) return ca.localeCompare(cb);
  return String(a.code).localeCompare(String(b.code));
}

/**
 * Stable sort honoring the full attention comparator. Exported so callers that
 * mutate items after {@link buildAttentionItems} (novelty, decision brief) can re-sort.
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
export function sortAttentionItems(items) {
  return [...(items ?? [])].sort(compareAttentionItems);
}

/**
 * Collapse multiple component-instrument items for the same component into a single
 * dominant item, recording the suppressed codes on `sub_codes` so the UI can show
 * "+N more" instead of stacking near-duplicate rows.
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
function collapseComponentItems(items) {
  const groups = new Map();
  const result = [];

  for (const it of items) {
    if (it.component_id && COMPONENT_INSTRUMENT_CODES.has(it.code)) {
      const arr = groups.get(it.component_id) ?? [];
      arr.push(it);
      groups.set(it.component_id, arr);
    } else {
      result.push(it);
    }
  }

  for (const group of groups.values()) {
    group.sort((a, b) => {
      const la = ATTENTION_LEVELS[a.level] ?? 99;
      const lb = ATTENTION_LEVELS[b.level] ?? 99;
      if (la !== lb) return la - lb;
      const ka = KIND_PRIORITY[a.kind] ?? 9;
      const kb = KIND_PRIORITY[b.kind] ?? 9;
      if (ka !== kb) return ka - kb;
      return (b.magnitude ?? 0) - (a.magnitude ?? 0);
    });
    const [winner, ...rest] = group;
    if (rest.length > 0) {
      winner.sub_codes = rest.map((r) => r.code);
    }
    result.push(winner);
  }

  return result;
}

/**
 * @param {object | null | undefined} assessment
 * @param {{ view?: 'operator' | 'analyst', reportScopeId?: string, priorReports?: Array<object> }} [opts]
 *   `priorReports` — array of prior assessment objects (newest first) used for abstention fatigue detection.
 * @returns {Array<object>}
 */
export function buildAttentionItems(assessment, opts = {}) {
  if (!assessment || typeof assessment !== 'object') return [];

  const view = opts.view === DISPLAY_VIEWS.analyst
    ? DISPLAY_VIEWS.analyst
    : DISPLAY_VIEWS.operator;
  const isAnalyst = view === DISPLAY_VIEWS.analyst;
  const reportScopeId = opts.reportScopeId
    ?? assessment.report_scope?.id
    ?? 'national';

  const items = [];
  const seenIds = new Set();
  const push = createAttentionPush(items, seenIds);

  const dataVoid = assessment.data_void ?? null;
  const epistemicStatus = assessment.epistemic_status ?? null;
  const assessmentMode = assessment.assessment_mode ?? 'normal';
  const methodology = assessment.methodology ?? null;

  addDataVoidAttentionItems(push, item, dataVoid);
  addAbstentionFatigueItems(push, item, assessment, opts.priorReports ?? []);
  addEpistemicAttentionItems(push, item, assessment, assessmentMode, epistemicStatus);
  addGeoAttentionItems(push, item, methodology, reportScopeId);
  addComponentAttentionItems(push, item, assessment.components, isAnalyst, {
    dataVoid,
    epistemicStatus,
  });
  addClusterAttentionItems(push, item, dataVoid);
  addSocialQuarantineAttentionItems(push, item, assessment.social_channel_quarantine ?? null);
  addMacroAttentionItems(push, item, assessment);
  addOovAttentionItems(push, item, assessment, isAnalyst, methodology);
  addOperatorRecommendationItems(push, item, assessment.operator_recommendations);

  // Pattern detections carry channels/evidence; surface only those not already
  // represented by a pending operator recommendation (recs are 1:1 with patterns).
  const coveredPatternCodes = new Set(
    (assessment.operator_recommendations ?? [])
      .filter((r) => r.status === 'pending')
      .map((r) => r.pattern_code)
      .filter(Boolean),
  );
  addPatternAttentionItems(push, item, assessment.pattern_alerts, coveredPatternCodes);

  for (const it of items) {
    it.kind = kindForItem(it);
    it.magnitude = magnitudeForItem(it);
  }

  return sortAttentionItems(collapseComponentItems(items));
}

/**
 * Annotate items with day-over-day novelty by comparing against the prior report's
 * attention items: `new` (absent yesterday), `escalating` (more severe than yesterday),
 * or `ongoing`. Mutates and returns `currentItems` (caller re-sorts).
 * @param {Array<object>} currentItems
 * @param {Array<object>} priorItems
 * @returns {Array<object>}
 */
export function annotateAttentionNovelty(currentItems, priorItems) {
  const prior = new Map();
  for (const p of priorItems ?? []) {
    if (p?.id) prior.set(p.id, p.level);
  }
  for (const it of currentItems ?? []) {
    if (!prior.has(it.id)) {
      it.novelty = 'new';
      continue;
    }
    const priorLevel = ATTENTION_LEVELS[prior.get(it.id)] ?? 99;
    const curLevel = ATTENTION_LEVELS[it.level] ?? 99;
    it.novelty = curLevel < priorLevel ? 'escalating' : 'ongoing';
  }
  return currentItems;
}

/**
 * Fold the LLM decision brief's ranked priority items into the attention list:
 * matching items are annotated with the brief rationale/next-step and a `brief_rank`
 * that floats them to the head; unmatched priority items become synthesized head items.
 * Mutates matched items; returns a new array (caller re-sorts).
 * @param {Array<object>} items
 * @param {object|null|undefined} decisionBrief
 * @returns {Array<object>}
 */
export function applyDecisionBriefPriority(items, decisionBrief) {
  const priorityItems = decisionBrief?.priority_items;
  if (!Array.isArray(priorityItems) || priorityItems.length === 0) return items ?? [];

  const result = [...(items ?? [])];
  const byId = new Map(result.map((it) => [it.id, it]));
  const byRec = new Map();
  for (const it of result) {
    if (it.recommendation_id) byRec.set(it.recommendation_id, it);
  }

  priorityItems.forEach((p, i) => {
    let target = null;
    if (p.attention_id && byId.has(p.attention_id)) target = byId.get(p.attention_id);
    else if (p.recommendation_id && byRec.has(p.recommendation_id)) target = byRec.get(p.recommendation_id);

    if (target) {
      target.brief_rank = i;
      target.brief_rationale = p.rationale ?? null;
      target.brief_next_step = p.suggested_next_step ?? null;
      target.kind = ATTENTION_KINDS.tasking;
      return;
    }

    result.push({
      id: `brief:${p.attention_id ?? p.recommendation_id ?? i}`,
      level: ['critical', 'warning', 'watch', 'info'].includes(p.level) ? p.level : 'watch',
      code: 'decision_brief_priority',
      title_key: 'attention.brief.priorityItem',
      kind: ATTENTION_KINDS.tasking,
      magnitude: 0,
      brief_rank: i,
      brief_rationale: p.rationale ?? null,
      brief_next_step: p.suggested_next_step ?? null,
      suggested_action_key: null,
    });
  });

  return result;
}
