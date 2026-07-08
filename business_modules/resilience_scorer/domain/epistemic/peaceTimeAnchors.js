/**
 * Peace-time / crisis-day score anchors for chronic baseline (dual baseline monitoring).
 */
import { resolveStateStore } from '../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../config/peaceTimeAnchors.json',
);

let cached = null;

/**
 * @returns {{ national?: Record<string, number>, north?: Record<string, number> }}
 */
export function loadPeaceTimeAnchors(configPath = process.env.RESILIENCE_PEACE_ANCHORS_PATH ?? DEFAULT_PATH) {
  if (cached && configPath === DEFAULT_PATH) return cached;
  if (!getStore().existsSync(configPath)) {
    const empty = { national: {}, north: {} };
    if (configPath === DEFAULT_PATH) cached = empty;
    return empty;
  }
  try {
    const parsed = JSON.parse(getStore().readFileSync(configPath, 'utf8'));
    const out = {
      national: parsed.national ?? parsed.components ?? {},
      north: parsed.north ?? parsed.north_components ?? {},
    };
    if (configPath === DEFAULT_PATH) cached = out;
    return out;
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
