/**
 * Presence gates — curated critical signals that force presence-gate flags on components.
 *
 * Pipeline position: assess — called from buildComponentEvidence while assembling critical_flags.presence_gate.
 *
 * Owns: PRESENCE_GATE_RULES, evaluatePresenceGates, env kill-switch (RESILIENCE_PRESENCE_GATES).
 * Does NOT: compute sufficiency/balance bands or numeric scores (componentEvidence.js owns count bands).
 *
 * Key collaborators: componentEvidence.js, highSalienceBypass.js, signalRouter.js, groundingPolicy.js.
 */

import { GROUNDING_TIER } from '../services/signals/groundingPolicy.js';
import { CRITICAL_BYPASS_SIGNAL_TYPES } from './highSalienceBypass.js';
import { SIGNAL_TO_COMPONENTS } from '../services/signals/routing/signalRouter.js';

/** Version stamp for the hand-authored presence-gate rule set (audits / manifests). */
export const PRESENCE_GATE_VERSION = '2026-05-v1';

// --- Rule tables ---

/** Ordinal rank for comparing signal.intensity against rule minIntensity thresholds. */
const INTENSITY_RANK = { light: 0, moderate: 1, severe: 2 };

/**
 * Hand-authored gate rules: if a grounded signal of one of these types appears
 * for a listed component (and intensity meets minIntensity when set), the
 * component's presence gate triggers.
 * @type {Array<{ id: string, signalTypes: string[], componentIds: string[], minIntensity?: string }>}
 */
export const PRESENCE_GATE_RULES = [
  {
    id: 'infra_acute_functional',
    signalTypes: ['infrastructure_damage_acute'],
    componentIds: ['functional_continuity'],
  },
  {
    id: 'harm_wellbeing',
    signalTypes: ['harm_to_population'],
    componentIds: ['wellbeing_at_risk'],
    minIntensity: 'moderate',
    requireConflictLinkage: true,
  },
  {
    id: 'ew_failure_lifesaving',
    signalTypes: ['early_warning_system_failure'],
    componentIds: ['lifesaving_behavior', 'information_communication'],
  },
  {
    id: 'plan_failed_functional',
    signalTypes: ['plan_failed_during_event'],
    componentIds: ['functional_continuity', 'leadership'],
  },
  {
    id: 'protective_infra_absent',
    signalTypes: ['protective_infrastructure_absent'],
    componentIds: ['lifesaving_behavior', 'functional_continuity'],
  },
];

/**
 * Auto-extend rules from CRITICAL_BYPASS_SIGNAL_TYPES × negative routing edges
 * so curated critical types without a hand rule still gate their negative components.
 * @returns {typeof PRESENCE_GATE_RULES}
 */
function buildCriticalMappingRules() {
  const seen = new Set(PRESENCE_GATE_RULES.map((r) => r.id));
  /** @type {typeof PRESENCE_GATE_RULES} */
  const extra = [];
  for (const signalType of CRITICAL_BYPASS_SIGNAL_TYPES) {
    if (PRESENCE_GATE_RULES.some((r) => r.signalTypes.includes(signalType))) continue;
    const mapping = SIGNAL_TO_COMPONENTS[signalType];
    if (!mapping) continue;
    const componentIds = Object.entries(mapping)
      .filter(([, edge]) => edge.polarity === '-')
      .map(([cid]) => cid);
    if (componentIds.length === 0) continue;
    const id = `critical_${signalType}`;
    if (seen.has(id)) continue;
    seen.add(id);
    extra.push({ id, signalTypes: [signalType], componentIds });
  }
  return extra;
}

/** Hand-authored rules plus auto-generated critical-type rules (evaluated together). */
const ALL_RULES = [...PRESENCE_GATE_RULES, ...buildCriticalMappingRules()];

// --- Evaluation ---

/**
 * Kill-switch: set RESILIENCE_PRESENCE_GATES=0 to disable all presence gates.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isPresenceGatesEnabled(env = process.env) {
  return env.RESILIENCE_PRESENCE_GATES !== '0';
}

/**
 * Conflict/war framing in evidence text (Hebrew + English). Rules with
 * requireConflictLinkage only gate on harm tied to the security situation —
 * a domestic apartment fire is tragic but is not a war-resilience critical
 * failure, and must not drive the report's loudest flag.
 */
const CONFLICT_LINKAGE_RE = new RegExp(
  [
    'טיל', 'רקט', 'כטב', 'פצמ', 'יירוט', 'אזעק', 'שיגור', 'מלחמ', 'מתקפ', 'פיגוע', 'ירי', 'צבע אדום', 'רסיס',
    'missile', 'rocket', 'drone', 'UAV', 'shrapnel', 'intercept', 'strike', 'attack', 'siren', '\\bwar\\b', 'hostilit',
  ].join('|'),
  'i',
);

/**
 * Whether signal intensity meets a rule's minimum threshold.
 * @param {string | undefined | null} intensity
 * @param {string | undefined} minIntensity
 * @returns {boolean}
 */
function meetsMinIntensity(intensity, minIntensity) {
  if (!minIntensity) return true;
  const got = INTENSITY_RANK[intensity ?? 'moderate'] ?? 1;
  const need = INTENSITY_RANK[minIntensity] ?? 1;
  return got >= need;
}

/** Default result when no grounded signal trips a presence gate for the component. */
const EMPTY_PRESENCE_GATE = {
  triggered: false,
  rule_id: null,
  signal_type: null,
  evidence_snippet: null,
};

/**
 * First matching presence-gate rule for this signal among rulesForComponent.
 *
 * @param {object} signal
 * @param {typeof PRESENCE_GATE_RULES} rulesForComponent
 * @returns {{ triggered: boolean, rule_id: string, signal_type: string, evidence_snippet: string|null } | null}
 */
function matchPresenceGateRule(signal, rulesForComponent) {
  const type = signal.signal_type ?? signal.type;
  if (!type) return null;

  for (const rule of rulesForComponent) {
    if (!rule.signalTypes.includes(type)) continue;
    if (!meetsMinIntensity(signal.intensity, rule.minIntensity)) continue;
    if (rule.requireConflictLinkage && !CONFLICT_LINKAGE_RE.test(String(signal.evidence ?? ''))) continue;
    return {
      triggered: true,
      rule_id: rule.id,
      signal_type: type,
      evidence_snippet: String(signal.evidence ?? '').slice(0, 200) || null,
    };
  }
  return null;
}

/**
 * Evaluate whether any grounded signal in the component pool trips a presence
 * gate for this componentId. Returns the first match or an empty (not triggered)
 * result. Safe to call when gates are disabled (always empty).
 *
 * @param {string} componentId
 * @param {Array<{ signal: object, contribution?: number }>} cappedItems
 *   Component signal items (contribution field is legacy/unused here).
 * @returns {{
 *   triggered: boolean,
 *   rule_id: string | null,
 *   signal_type: string | null,
 *   evidence_snippet: string | null,
 * }}
 */
export function evaluatePresenceGates(componentId, cappedItems) {
  if (!isPresenceGatesEnabled()) return EMPTY_PRESENCE_GATE;

  const rulesForComponent = ALL_RULES.filter((r) => r.componentIds.includes(componentId));
  if (rulesForComponent.length === 0) return EMPTY_PRESENCE_GATE;

  for (const it of cappedItems ?? []) {
    const signal = it?.signal;
    if (!signal || signal.grounding_tier !== GROUNDING_TIER.grounded) continue;
    const match = matchPresenceGateRule(signal, rulesForComponent);
    if (match) return match;
  }

  return EMPTY_PRESENCE_GATE;
}
