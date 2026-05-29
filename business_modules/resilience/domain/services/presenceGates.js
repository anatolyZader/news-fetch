/**
 * Presence gates — verified grounded signals force operator critical_failure
 * on mapped components regardless of aggregate score / positive counter-evidence.
 *
 * @see docs/MODEL-CARD.md
 */

import { GROUNDING_TIER } from './groundingPolicy.js';
import { CRITICAL_BYPASS_SIGNAL_TYPES } from './highSalienceBypass.js';
import { SIGNAL_TO_COMPONENTS } from './signalCatalog.js';

export const PRESENCE_GATE_VERSION = '2026-05-v1';

const INTENSITY_RANK = { low: 0, moderate: 1, severe: 2 };

/** @type {Array<{ id: string, signalTypes: string[], componentIds: string[], minIntensity?: string }>} */
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

/** Rules derived from critical bypass types × negative component mappings. */
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

/**
 * @param {string} componentId
 * @param {Array<{ signal: object, contribution?: number }>} cappedItems
 * @returns {{
 *   triggered: boolean,
 *   rule_id: string | null,
 *   signal_type: string | null,
 *   evidence_snippet: string | null,
 * }}
 */
export function evaluatePresenceGates(componentId, cappedItems) {
  const empty = {
    triggered: false,
    rule_id: null,
    signal_type: null,
    evidence_snippet: null,
  };
  if (!isPresenceGatesEnabled()) return empty;

  const rulesForComponent = ALL_RULES.filter((r) => r.componentIds.includes(componentId));
  if (rulesForComponent.length === 0) return empty;

  for (const it of cappedItems ?? []) {
    const signal = it?.signal;
    if (!signal) continue;
    if (signal.grounding_tier !== GROUNDING_TIER.grounded) continue;

    const type = signal.signal_type ?? signal.type;
    if (!type) continue;

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
  }

  return empty;
}
