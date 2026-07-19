/**
 * Peace-time / crisis-day score anchors for chronic baseline (dual baseline monitoring).
 */
import { resolveStateStore } from '../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}
// Default peace-time component anchors (1-10). Override via RESILIENCE_PEACE_ANCHORS_PATH
// or update after the baseline validation phase.
const DEFAULT_ANCHORS = Object.freeze({
  national: Object.freeze({
    narrative: 8,
    information_communication: 8,
    lifesaving_behavior: 8,
    functional_continuity: 8,
    community_capital: 8,
    leadership: 8,
    belonging_solidarity: 8,
    wellbeing_at_risk: 8,
  }),
  north: Object.freeze({
    narrative: 8,
    information_communication: 8,
    lifesaving_behavior: 8,
    functional_continuity: 8,
    community_capital: 8,
    leadership: 8,
    belonging_solidarity: 8,
    wellbeing_at_risk: 8,
  }),
});

/**
 * @returns {{ national?: Record<string, number>, north?: Record<string, number> }}
 */
export function loadPeaceTimeAnchors(configPath = process.env.RESILIENCE_PEACE_ANCHORS_PATH) {
  if (!configPath) return DEFAULT_ANCHORS;
  if (!getStore().existsSync(configPath)) return { national: {}, north: {} };
  try {
    const parsed = JSON.parse(getStore().readFileSync(configPath, 'utf8'));
    return {
      national: parsed.national ?? parsed.components ?? {},
      north: parsed.north ?? parsed.north_components ?? {},
    };
  } catch {
    return { national: {}, north: {} };
  }
}

/**
 * @param {string} scopeId
 * @param {string} componentId
 */
export function getPeaceTimeAnchor(scopeId, componentId) {
  const anchors = loadPeaceTimeAnchors();
  const bucket = scopeId === 'north' ? anchors.north : anchors.national;
  const v = bucket?.[componentId];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function isDualBaselineEnabled() {
  return process.env.RESILIENCE_DUAL_BASELINE !== '0';
}
