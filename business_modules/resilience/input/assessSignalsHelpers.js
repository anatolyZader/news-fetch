/**
 * Pure helpers used by assess-signals.js. Extracted from the CLI so they can
 * be unit-tested without invoking the full pipeline.
 *
 *   - crossSourceDedup: collapses identical evidence republished across outlets.
 *   - loadHistoricalScores: reads recent resilience-report-*.json files into a
 *       per-component score series for delta computation.
 *   - ewmaScore / deltaSignificance: tiny stats helpers.
 *   - enrichWithDeltaChannel: adds smoothed score + delta + significance fields
 *       to each component in a scoreComponents() result.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

/** Lower-cased, punctuation-free first 120 chars of evidence — stable for keying. */
function normalisedEvidence(s) {
  return (s.evidence ?? '')
    .toLowerCase()
    .replace(/[^\w\u0590-\u05FF]/g, '')
    .slice(0, 120);
}

function reliabilityRank(s) {
  const order = {
    direct_quote_named_person: 4,
    named_survey_statistic:    3,
    named_institutional_fact:  2,
    observational_reported_fact: 1,
  };
  return order[s.evidence_type] ?? 0;
}

/**
 * Cross-source dedup: collapses the SAME primary quote reported by multiple
 * outlets into a single signal so coverage / mass aren't inflated by re-publication.
 * Key is `signal_type|normalised_evidence` (no source). Among colliding signals,
 * keep the one with the highest (temporal_weight, reliability) tuple.
 */
export function crossSourceDedup(signals) {
  const seen = new Map();
  for (const s of signals) {
    const key = `${s.signal_type ?? '_'}|${normalisedEvidence(s)}`;
    if (!key.endsWith('|')) {
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, s);
        continue;
      }
      const sw = (s.temporal_weight ?? 1) + reliabilityRank(s) * 0.01;
      const ew = (existing.temporal_weight ?? 1) + reliabilityRank(existing) * 0.01;
      if (sw > ew) seen.set(key, s);
    } else {
      // Empty evidence — skip dedup (let downstream filtering deal with it).
      const fallback = `${key}::${s.article_source ?? ''}::${s.article_url ?? ''}`;
      seen.set(fallback, s);
    }
  }
  return [...seen.values()];
}

/**
 * Walk reports dir and return per-component score history for the trailing
 * `days` days BEFORE `targetDate` (i.e. excluding `targetDate` itself).
 *
 * Returns: { component_id: [score_d-1, score_d-2, ..., score_d-N] }
 *   — where the most recent prior day's score is at index 0.
 *   — `null` slots are dropped (insufficient_data days don't pollute the series).
 */
export function loadHistoricalScores(targetDate, reportsDir = 'reports', days = 14) {
  const dir = resolve(reportsDir);
  if (!existsSync(dir)) return {};
  const allFiles = readdirSync(dir);
  const targetTime = new Date(targetDate).getTime();
  if (Number.isNaN(targetTime)) return {};

  const seriesByComponent = {};

  for (let i = 1; i <= days; i++) {
    const d = new Date(targetTime);
    d.setUTCDate(d.getUTCDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    const match = allFiles
      .filter((f) => f.startsWith(`resilience-report-${dStr}`) && f.endsWith('.json'))
      .sort()
      .at(-1);
    if (!match) continue;

    let json;
    try {
      json = JSON.parse(readFileSync(resolve(dir, match), 'utf8'));
    } catch {
      continue;
    }
    const components = json.assessment?.components ?? [];
    for (const c of components) {
      if (c.score == null) continue;
      if (!seriesByComponent[c.component_id]) seriesByComponent[c.component_id] = [];
      seriesByComponent[c.component_id].push(c.score);
    }
  }
  return seriesByComponent;
}

/** EWMA: alpha * today + (1 - alpha) * yesterday. Returns rounded integer. */
export function ewmaScore(today, yesterday, alpha) {
  if (today == null) return null;
  if (yesterday == null) return today;
  if (typeof alpha !== 'number' || Number.isNaN(alpha)) alpha = 0.5;
  const a = Math.min(1, Math.max(0, alpha));
  return Math.round(a * today + (1 - a) * yesterday);
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

/**
 * z-score of `today` against `history`. Returns null when fewer than 2 points
 * are available or the series is degenerate (zero variance).
 */
export function deltaSignificance(today, history) {
  if (today == null || !Array.isArray(history) || history.length < 2) return null;
  const sd = stddev(history);
  if (sd === 0) return null;
  return (today - mean(history)) / sd;
}

/**
 * Enrich the scoreComponents() result with `score_smoothed`, `delta_score`,
 * `delta_significance`, `delta_flag` for each component, using `history`
 * returned by loadHistoricalScores().
 *
 * Returns a NEW object (does not mutate the input).
 */
export function enrichWithDeltaChannel(scoredComponents, history = {}) {
  const out = {};
  for (const [id, c] of Object.entries(scoredComponents)) {
    const series = history[id] ?? [];
    const yesterday = series[0] ?? null;
    const baseline = series.slice(0, 14);
    const alpha = 0.3 + 0.5 * (c.certainty ?? 0);
    const score_smoothed = ewmaScore(c.score, yesterday, alpha);
    const delta_score = c.score != null && yesterday != null ? c.score - yesterday : null;
    const sig = deltaSignificance(c.score, baseline);
    const delta_flag = sig != null && Math.abs(sig) > 2 ? 'significant' : null;
    out[id] = {
      ...c,
      score_smoothed,
      delta_score,
      delta_significance: sig != null ? Math.round(sig * 100) / 100 : null,
      delta_flag,
    };
  }
  return out;
}
