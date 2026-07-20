/**
 * Presence gates — curated critical signals that force a critical_failure /
 * presence-gate flag on mapped components when grounding is verified.
 *
 * Pipeline position: called from buildComponentEvidence (componentEvidence.js)
 * while assembling each component's critical_flags.presence_gate. Specialist
 * agents and operator display treat a triggered gate as non-negotiable salience
 * even when aggregate counts look mixed or thin.
 *
 * Owns: PRESENCE_GATE_RULES, evaluatePresenceGates, env kill-switch.
 * Does NOT: change sufficiency/balance bands or invent numeric scores (min-math).
 * Only grounded signals (GROUNDING_TIER.grounded) can trip a gate.
 *
 * Key collaborators: highSalienceBypass.js (extra critical types),
 * signalRouter SIGNAL_TO_COMPONENTS (negative edges for auto rules),
 * groundingPolicy.js.
 *
 * @see docs/MODEL-CARD.md
 */

import { GROUNDING_TIER } from '../services/signals/groundingPolicy.js';
import { CRITICAL_BYPASS_SIGNAL_TYPES } from './highSalienceBypass.js';
import { SIGNAL_TO_COMPONENTS } from '../services/signals/routing/signalRouter.js';

/** Version stamp for presence-gate rule set (for audits / manifests). */
export const PRESENCE_GATE_VERSION = '2026-05-v1';

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
 * so curated critical types without a hand rule still gate their primary
 * negative components.
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
      .filter(([, w]) => w < 0)
      .map(([cid]) => cid);
    if (componentIds.length === 0) continue;
    const id = `critical_${signalType}`;
    if (seen.has(id)) continue;
    seen.add(id);
    extra.push({ id, signalTypes: [signalType], componentIds });
  }
  return extra;
}

const ALL_RULES = [...PRESENCE_GATE_RULES, ...buildCriticalMappingRules()];

/**
 * Kill-switch: set RESILIENCE_PRESENCE_GATES=0 to disable all presence gates.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isPresenceGatesEnabled(env = process.env) {
  return env.RESILIENCE_PRESENCE_GATES !== '0';
}

/**
 * @param {string | undefined | null} intensity
 * @param {string | undefined} minIntensity
 */
function meetsMinIntensity(intensity, minIntensity) {
  if (!minIntensity) return true;
  const got = INTENSITY_RANK[intensity ?? 'moderate'] ?? 1;
  const need = INTENSITY_RANK[minIntensity] ?? 1;
  return got >= need;
}

const EMPTY_PRESENCE_GATE = {
  triggered: false,
  rule_id: null,
  signal_type: null,
  evidence_snippet: null,
};

/**
 * First matching presence-gate rule for this signal among rulesForComponent.
 * @param {object} signal
 * @param {typeof PRESENCE_GATE_RULES} rulesForComponent
 */
function matchPresenceGateRule(signal, rulesForComponent) {
  const type = signal.signal_type ?? signal.type;
  if (!type) return null;

  for (const rule of rulesForComponent) {
    if (!rule.signalTypes.includes(type)) continue;
    if (!meetsMinIntensity(signal.intensity, rule.minIntensity)) continue;
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
