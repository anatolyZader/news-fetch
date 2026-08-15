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
export const PRESENCE_GATE_VERSION = '2026-08-v2';

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
    // `functional_continuity` removed: plan_failed_during_event has no routing
    // edge to it, so items for that component could never contain this type and
    // the entry could never fire. Rule ids are written into persisted reports as
    // presence_gate.rule_id, so the id stays stable despite the now-loose name.
    // Only dead entries are dropped here — no component is newly added, which
    // would be a behaviour expansion rather than a correction.
    id: 'plan_failed_functional',
    signalTypes: ['plan_failed_during_event'],
    componentIds: ['leadership'],
  },
  {
    // `functional_continuity` removed for the same reason.
    id: 'protective_infra_absent',
    signalTypes: ['protective_infrastructure_absent'],
    componentIds: ['lifesaving_behavior'],
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
      // An `inferred` edge is spillover from another component's evidence, not
      // a finding about this one. Every other evidence band reads primary-only
      // (componentEvidence.js buildOneComponent); the gate — which turns a
      // component red — must not be the single surface that fires on spillover.
      .filter(([, edge]) => edge.polarity === '-' && edge.role !== 'inferred')
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

/**
 * Merged rule table, exported for the routing-coherence guard test. Hand rules
 * do not consult SIGNAL_TO_COMPONENTS, so they drift from routing silently —
 * two entries had already gone dead this way. The guard asserts every listed
 * component is reachable from at least one of the rule's signal types over a
 * negative primary edge.
 */
export const PRESENCE_GATE_ALL_RULES = ALL_RULES;

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
  return findPresenceGateMatch(componentId, cappedItems).match;
}

/**
 * As evaluatePresenceGates, but also returns the item that tripped the gate so
 * the caller can make it visible. A gate turns a component red; the row that
 * caused it must not be rankable out of top_contributors.
 *
 * @param {string} componentId
 * @param {Array<{ signal: object }>} cappedItems
 * @returns {{ match: object, item: object | null }}
 */
export function findPresenceGateMatch(componentId, cappedItems) {
  if (!isPresenceGatesEnabled()) return { match: EMPTY_PRESENCE_GATE, item: null };

  const rulesForComponent = ALL_RULES.filter((r) => r.componentIds.includes(componentId));
  if (rulesForComponent.length === 0) return { match: EMPTY_PRESENCE_GATE, item: null };

  for (const it of cappedItems ?? []) {
    const signal = it?.signal;
    if (!signal || signal.grounding_tier !== GROUNDING_TIER.grounded) continue;
    const match = matchPresenceGateRule(signal, rulesForComponent);
    if (match) return { match, item: it };
  }

  return { match: EMPTY_PRESENCE_GATE, item: null };
}
