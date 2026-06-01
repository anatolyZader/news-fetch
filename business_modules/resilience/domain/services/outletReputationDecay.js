/**
 * Dynamic outlet reputation decay from verification drops and dedup collisions.
 */

import { getDefaultStateStore } from '../../../../cross-cut-modules/persistence/infrastructure/fsStateStoreAdapter.js';
const stateStore = getDefaultStateStore();
import { dirname, resolve } from 'node:path';

const DEFAULT_PATH = resolve('business_modules/news-sites/data/resilience-outlet-reputation.json');
const DECAY_CLAMP_MIN = 0.1;
const DECAY_CLAMP_MAX = 1.5;

let cachedStats = null;
let cachedPath = null;
let cachedMtime = null;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isOutletDecayEnabled(env = process.env) {
  return env.RESILIENCE_OUTLET_DECAY !== '0';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function reputationStorePath(env = process.env) {
  return env.RESILIENCE_OUTLET_REPUTATION_PATH ?? DEFAULT_PATH;
}

function loadStats(path) {
  if (!stateStore.existsSync(path)) return {};
  try {
    const raw = JSON.parse(stateStore.readFileSync(path, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function persistStats(path, stats) {
  stateStore.mkdirSync(dirname(path), { recursive: true });
  stateStore.writeFileSync(path, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
}

function getStats(path) {
  let currentMtime = null;
  if (stateStore.existsSync(path)) {
    try {
      currentMtime = stateStore.statSync(path).mtimeMs;
    } catch {
      currentMtime = null;
    }
  }
  if (cachedPath === path && cachedStats && cachedMtime === currentMtime) {
    return cachedStats;
  }
  cachedPath = path;
  cachedMtime = currentMtime;
  cachedStats = loadStats(path);
  return cachedStats;
}

/**
 * @param {string} outlet
 * @param {{ dropped?: number, verified?: number, dedupHits?: number }} delta
 * @param {NodeJS.ProcessEnv} [env]
 */
export function recordOutletTelemetry(outlet, delta, env = process.env) {
  if (!isOutletDecayEnabled(env) || !outlet) return;
  const path = reputationStorePath(env);
  const stats = { ...getStats(path) };
  const row = stats[outlet] ?? {
    dropped: 0,
    verified: 0,
    dedup_hits: 0,
    last_updated: null,
  };
  if (delta.dropped) row.dropped += delta.dropped;
  if (delta.verified) row.verified += delta.verified;
  if (delta.dedupHits) row.dedup_hits += delta.dedupHits;
  row.last_updated = new Date().toISOString();
  stats[outlet] = row;
  cachedStats = stats;
  cachedPath = path;
  cachedMtime = stateStore.existsSync(path) ? stateStore.statSync(path).mtimeMs : null;
  persistStats(path, stats);
}

/**
 * @param {string} outlet
 * @param {number} baseMultiplier static prior
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function decayedOutletMultiplier(outlet, baseMultiplier, env = process.env) {
  if (!isOutletDecayEnabled(env) || !outlet) {
    return Math.min(DECAY_CLAMP_MAX, Math.max(DECAY_CLAMP_MIN, baseMultiplier));
  }
  const stats = getStats(reputationStorePath(env))[outlet];
  if (!stats) {
    return Math.min(DECAY_CLAMP_MAX, Math.max(DECAY_CLAMP_MIN, baseMultiplier));
  }
  const total = (stats.verified ?? 0) + (stats.dropped ?? 0);
  const dropRate = total > 0 ? (stats.dropped ?? 0) / total : 0;
  const dedupPenalty = 1 / (1 + 0.1 * (stats.dedup_hits ?? 0));
  const decayed = baseMultiplier * (1 - 0.5 * dropRate) * dedupPenalty;
  return Math.min(DECAY_CLAMP_MAX, Math.max(DECAY_CLAMP_MIN, decayed));
}

/** Test hook */
export function resetOutletReputationCacheForTests() {
  cachedStats = null;
  cachedPath = null;
  cachedMtime = null;
}

export { DECAY_CLAMP_MIN, DECAY_CLAMP_MAX };
