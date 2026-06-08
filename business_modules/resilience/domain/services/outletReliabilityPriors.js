import { resolveStateStore } from '../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}
import { resolve } from 'node:path';
import { decayedOutletMultiplier, isOutletDecayEnabled } from './outletReputationDecay.js';

let cached = null;
let cachedPath = null;
let cachedMtimeMs = null;

/**
 * Optional per-outlet reliability multiplier (N14 stub).
 * Reads `config/resilience-outlet-priors.json`: `{ "ynet.co.il": { "reliabilityMultiplier": 1.1 }, ... }`
 * Values are clamped to [0.5, 1.5]. Missing file or key → 1.
 *
 * C3 — mtime-aware cache: long-running processes (the watcher / dev server) used
 * to keep a stale cache after operators edited the priors file because the cache
 * only invalidated on path changes. We now stat the file on each call (~few µs)
 * and reload when the mtime advances. The load itself is still cached, so this
 * is essentially free in the common case.
 */
function resolvePriorsConfigPath(configPath) {
  return configPath
    ?? process.env.RESILIENCE_OUTLET_PRIORS_PATH
    ?? resolve(process.cwd(), 'config', 'resilience-outlet-priors.json');
}

function readPriorsMtime(path) {
  if (!getStore().existsSync(path)) return null;
  try {
    return getStore().statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

function loadPriorsFromPath(path, currentMtime) {
  if (currentMtime == null) return {};
  try {
    const raw = JSON.parse(getStore().readFileSync(path, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function refreshPriorsCacheIfNeeded(path) {
  const currentMtime = readPriorsMtime(path);
  const pathChanged = cachedPath !== path;
  const mtimeChanged = currentMtime !== cachedMtimeMs;
  if (!pathChanged && !mtimeChanged && cached !== null) return;
  cachedPath = path;
  cachedMtimeMs = currentMtime;
  cached = loadPriorsFromPath(path, currentMtime);
}

function multiplierFromEntry(articleSource) {
  if (!articleSource || typeof articleSource !== 'string') return 1;
  const entry = cached[articleSource];
  const m = entry?.reliabilityMultiplier ?? entry?.multiplier;
  if (typeof m !== 'number' || Number.isNaN(m)) return 1;
  const base = Math.min(1.5, Math.max(0.5, m));
  if (!isOutletDecayEnabled()) return base;
  return decayedOutletMultiplier(articleSource, base);
}

export function getOutletReliabilityMultiplier(articleSource, configPath) {
  const path = resolvePriorsConfigPath(configPath);
  refreshPriorsCacheIfNeeded(path);
  return multiplierFromEntry(articleSource);
}

/** Test hook: reset module cache */
export function resetOutletReliabilityPriorsCacheForTests() {
  cached = null;
  cachedPath = null;
  cachedMtimeMs = null;
}
