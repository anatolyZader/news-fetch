import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

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
export function getOutletReliabilityMultiplier(articleSource, configPath) {
  const path = configPath
    ?? process.env.RESILIENCE_OUTLET_PRIORS_PATH
    ?? resolve(process.cwd(), 'config', 'resilience-outlet-priors.json');

  let currentMtime = null;
  if (existsSync(path)) {
    try {
      currentMtime = statSync(path).mtimeMs;
    } catch {
      currentMtime = null;
    }
  }

  const pathChanged = cachedPath !== path;
  const mtimeChanged = currentMtime !== cachedMtimeMs;
  if (pathChanged || mtimeChanged || cached === null) {
    cachedPath = path;
    cachedMtimeMs = currentMtime;
    if (currentMtime == null) {
      cached = {};
    } else {
      try {
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        cached = raw && typeof raw === 'object' ? raw : {};
      } catch {
        cached = {};
      }
    }
  }

  if (!articleSource || typeof articleSource !== 'string') return 1;
  const entry = cached[articleSource];
  const m = entry?.reliabilityMultiplier ?? entry?.multiplier;
  if (typeof m !== 'number' || Number.isNaN(m)) return 1;
  return Math.min(1.5, Math.max(0.5, m));
}

/** Test hook: reset module cache */
export function resetOutletReliabilityPriorsCacheForTests() {
  cached = null;
  cachedPath = null;
  cachedMtimeMs = null;
}
