/**
 * Action compass — kind taxonomy for user-facing action classification.
 *
 * Pipeline position: STAGE-2 assess finalize — classifies raw candidates (attention,
 * recommendations, brief items, gaps, void/geo actions) into action KINDS before
 * ranking and phrasing.
 *
 * Owns: `ACTION_KINDS`, code→kind mapping, brief keyword classifier, info-noise filter.
 * Does NOT: rank or phrase actions (see sibling modules) or build the compass panel.
 *
 * Key collaborators: `actionCompass/actionCompass.js`, `services/user/attentionItems.js`.
 */

// ---------------------------------------------------------------------------
// Kind taxonomy
// ---------------------------------------------------------------------------

/** User-facing action kind constants (corroborate, investigate, etc.). */
export const ACTION_KINDS = Object.freeze({
  corroborate: 'corroborate',
  repair_sampling: 'repair_sampling',
  communicate: 'communicate',
  investigate: 'investigate',
  allocate: 'allocate',
  monitor: 'monitor',
  escalate: 'escalate',
});

/** i18n key suffix per kind (camelCase for translation keys). */
export const KIND_I18N = Object.freeze({
  corroborate: 'corroborate',
  repair_sampling: 'repairSampling',
  communicate: 'communicate',
  investigate: 'investigate',
  allocate: 'allocate',
  monitor: 'monitor',
  escalate: 'escalate',
});

/** Codes that are pure developer/context noise — never become compass actions. */
export const INFO_NOISE_CODES = Object.freeze(new Set([
  'macro_signals',
  'oov_scoring_applied',
  'calibration_deficit',
  'oov_capture',
]));

// ---------------------------------------------------------------------------
// Code and keyword mapping (internal)
// ---------------------------------------------------------------------------

const CODE_TO_KIND = Object.freeze({
  // corroborate — digital is blind/dark; confirm via field + trusted channels
  digital_darkness: ACTION_KINDS.corroborate,
  sampling_blind: ACTION_KINDS.corroborate,
  abstention_fatigue: ACTION_KINDS.corroborate,
  field_anchor_only: ACTION_KINDS.corroborate,
  cluster_digital_darkness: ACTION_KINDS.corroborate,
  void_field: ACTION_KINDS.corroborate,

  // repair_sampling — digital intake degraded/quarantined; restore feed integrity
  quarantined_digital: ACTION_KINDS.repair_sampling,
  data_void_drop: ACTION_KINDS.repair_sampling,
  osint_quarantine_auto: ACTION_KINDS.repair_sampling,
  social_quarantine_active: ACTION_KINDS.repair_sampling,
  social_quarantine_suggested: ACTION_KINDS.repair_sampling,

  // monitor — persisted situation, low novelty; track restoration
  persisted_digital_quarantine: ACTION_KINDS.monitor,

  // communicate — term/rumor burst; prepare messaging
  oov_burst: ACTION_KINDS.communicate,

  // investigate — component-level thin/contested/single-source evidence
  presence_gate: ACTION_KINDS.investigate,
  critical_single_signal: ACTION_KINDS.investigate,
  unverified_alert: ACTION_KINDS.investigate,
  contested_evidence: ACTION_KINDS.investigate,
  thin_evidence: ACTION_KINDS.investigate,
  gap: ACTION_KINDS.investigate,

  // allocate — which locations/clusters need triage before dispatch
  affected_clusters: ACTION_KINDS.allocate,
  geo_unknown: ACTION_KINDS.allocate,
  geo_quality_low: ACTION_KINDS.allocate,

  // escalate
  escalate_void: ACTION_KINDS.escalate,
});

/** Keyword classifier for free-text brief items (no structured code). */
const BRIEF_KEYWORD_KINDS = [
  [/field|corrobor|on[- ]?ground|volunteer|local authorit|direct observ/i, ACTION_KINDS.corroborate],
  [/quarantin|sampling|feed|channel|intake|extraction/i, ACTION_KINDS.repair_sampling],
  [/rumor|rumour|messag|clarif|communicat|public/i, ACTION_KINDS.communicate],
  [/cluster|neighborhood|neighbourhood|locat|dispatch|triage|geo/i, ACTION_KINDS.allocate],
  [/monitor|track|re-?check|restor|watch/i, ACTION_KINDS.monitor],
  [/escalat|authorit|notify|convene/i, ACTION_KINDS.escalate],
];

// ---------------------------------------------------------------------------
// Classification API
// ---------------------------------------------------------------------------

/**
 * Classify a free-text brief item into an action kind via keyword heuristics.
 * @param {string} text
 * @returns {string} one of `ACTION_KINDS`
 */
export function classifyBriefKind(text) {
  const str = String(text ?? '');
  for (const [re, kind] of BRIEF_KEYWORD_KINDS) {
    if (re.test(str)) return kind;
  }
  return ACTION_KINDS.investigate;
}

/**
 * Classify a raw compass candidate into one of `ACTION_KINDS`.
 * @param {{ source?: string, code?: string|null, level?: string, component_id?: string|null, text?: string, suggested_action_key?: string }} candidate
 * @returns {string} one of `ACTION_KINDS`
 */
export function classifyKind(candidate = {}) {
  const code = candidate.code ?? null;
  if (code && CODE_TO_KIND[code]) return CODE_TO_KIND[code];

  if (candidate.source === 'gap') return ACTION_KINDS.investigate;
  if (candidate.source === 'brief') return classifyBriefKind(candidate.text);

  // recommendation suggested_action heuristic
  if (candidate.source === 'recommendation') {
    const sa = candidate.suggested_action_key ?? '';
    if (/commsClarification|monitorRumors/i.test(sa)) return ACTION_KINDS.communicate;
    if (candidate.component_id) return ACTION_KINDS.investigate;
    return ACTION_KINDS.communicate;
  }

  // attention fallback by component presence
  if (candidate.component_id) return ACTION_KINDS.investigate;
  return ACTION_KINDS.corroborate;
}

/**
 * Whether an attention/recommendation code is info-only noise (excluded from compass).
 * @param {string} code
 * @returns {boolean}
 */
export function isInfoNoise(code) {
  return INFO_NOISE_CODES.has(code);
}
