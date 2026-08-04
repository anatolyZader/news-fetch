/**
 * Stratified spot-check sampling of extraction signals for operator review.
 *
 * Picks a small, reproducible sample of the report's scoped signals — the
 * high-confidence happy path that otherwise reaches reports unreviewed — so
 * the operator can verify extraction quality per report without reading the
 * whole pool. Stratified by source_type × signal_type (≥1 pick per stratum,
 * round-robin, until the budget is spent) and seeded from reportDate+scope so
 * re-runs of the same report sample the same signals.
 */
import { createHash } from 'node:crypto';
import { SIGNAL_TO_COMPONENTS } from './routing/signalRouting.js';

/** Deterministic PRNG (mulberry32) — reproducible sampling, no Math.random. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(reportDate, scopeId) {
  const digest = createHash('sha256').update(`${reportDate}:${scopeId}`).digest();
  return digest.readUInt32BE(0);
}

/** In-place Fisher–Yates with the provided PRNG. */
function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function primaryComponents(signalType) {
  const routes = SIGNAL_TO_COMPONENTS[signalType];
  if (!routes) return [];
  return Object.entries(routes)
    .filter(([, edge]) => edge?.role === 'primary')
    .map(([componentId]) => componentId);
}

/**
 * @param {{
 *   signals: Array<object>,
 *   reportDate: string,
 *   scopeId: string,
 *   sampleSize?: number,
 * }} opts
 * @returns {Array<object>} spot-check records (without ids/timestamps — the store stamps those)
 */
export function sampleSpotChecks({ signals, reportDate, scopeId, sampleSize = 8 }) {
  const size = Number(sampleSize);
  if (!Number.isFinite(size) || size <= 0 || !Array.isArray(signals) || signals.length === 0) {
    return [];
  }

  const rand = mulberry32(seedFrom(reportDate, scopeId));

  const strata = new Map();
  for (const signal of signals) {
    const key = `${signal?.source_type ?? 'unknown'}|${signal?.signal_type ?? 'unknown'}`;
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(signal);
  }

  // Largest strata first (ties alphabetical) so proportional weight emerges
  // naturally from round-robin; shuffle within each stratum for the pick.
  const orderedKeys = [...strata.keys()].sort(
    (a, b) => strata.get(b).length - strata.get(a).length || a.localeCompare(b),
  );
  for (const key of orderedKeys) shuffle(strata.get(key), rand);

  const picks = [];
  const budget = Math.min(size, signals.length);
  for (let cursor = 0; picks.length < budget; cursor++) {
    let pickedThisPass = false;
    for (const key of orderedKeys) {
      if (picks.length >= budget) break;
      const pool = strata.get(key);
      if (cursor >= pool.length) continue;
      picks.push({ strataKey: key, signal: pool[cursor] });
      pickedThisPass = true;
    }
    if (!pickedThisPass) break;
  }

  return picks.map(({ strataKey, signal }) => ({
    report_date: reportDate,
    scope: scopeId,
    strata_key: strataKey,
    source_type: signal.source_type ?? null,
    signal_type: signal.signal_type ?? null,
    components: primaryComponents(signal.signal_type),
    evidence: signal.evidence ?? null,
    evidence_type: signal.evidence_type ?? null,
    article_url: signal.article_url ?? null,
    article_source: signal.article_source ?? null,
    signal_date: signal.date ?? null,
    status: 'pending',
  }));
}
