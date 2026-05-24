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
import { createHash } from 'node:crypto';
import { getPeaceTimeAnchor, isDualBaselineEnabled } from '../domain/services/peaceTimeAnchors.js';
import { embedText, embeddingsEnabled, embeddingModelId } from '../../../cross-cut-modules/vector_index/index.js';

/** Lower-cased, punctuation-free first 120 chars of evidence — stable for keying. */
function normalisedEvidence(s) {
  return (s.evidence ?? '')
    .toLowerCase()
    .replace(/[^\w\u0590-\u05FF]/g, '')
    .slice(0, 120);
}

function sha256Hex(s) {
  return createHash('sha256').update(String(s ?? '')).digest('hex');
}

const EMBED_CACHE = new Map();

async function embedCached(text, model) {
  const clean = String(text ?? '').trim();
  const key = `${model}:${sha256Hex(clean)}`;
  const cached = EMBED_CACHE.get(key);
  if (cached) return cached;
  const emb = await embedText(clean, { model });
  EMBED_CACHE.set(key, emb.vector);
  return emb.vector;
}

function dot(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function norm(a) {
  return Math.sqrt(dot(a, a)) || 1;
}

function cosine(a, b) {
  return dot(a, b) / (norm(a) * norm(b));
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
 * outlets WITHIN the same `source_type` into a single signal so coverage / mass
 * aren't inflated by re-publication. The dedup key is now
 * `source_type|signal_type|normalised_evidence` (A4) so that a press quote and
 * a field-team observation describing the same fact are NO LONGER collapsed —
 * the diversity layer (source_diversity_factor + source-type cap) needs both
 * channels to remain visible. Among colliding signals (same key), keep the one
 * with the highest (temporal_weight, reliability) tuple.
 *
 * Signals with empty evidence are passed through unchanged; the verifier is
 * expected to drop them upstream, but as defence-in-depth we keep them keyed
 * by article identity so they cannot collide with substantive signals.
 */
export function crossSourceDedup(signals) {
  const seen = new Map();
  for (const s of signals) {
    const evidenceKey = normalisedEvidence(s);
    if (evidenceKey === '') {
      const fallback = `_empty|${s.signal_type ?? '_'}|${s.article_source ?? ''}|${s.article_url ?? s.article_index ?? ''}`;
      seen.set(fallback, s);
      continue;
    }
    const key = `${s.source_type ?? '_unknown'}|${s.signal_type ?? '_'}|${evidenceKey}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, s);
      continue;
    }
    const sw = (s.temporal_weight ?? 1) + reliabilityRank(s) * 0.01;
    const ew = (existing.temporal_weight ?? 1) + reliabilityRank(existing) * 0.01;
    if (sw > ew) seen.set(key, s);
  }
  return [...seen.values()];
}

function semanticDedupEnabled() {
  if (process.env.RESILIENCE_SEMANTIC_DEDUP === '0') return false;
  return embeddingsEnabled();
}

/**
 * Optional semantic dedup: collapses paraphrased duplicates that slip past the
 * `normalisedEvidence` keying. Only dedups within the same (source_type, signal_type).
 *
 * Keeps the highest (temporal_weight, reliability) tuple, matching the intent
 * of crossSourceDedup. Marks the kept item with `_semantic_dedup_count`.
 */
export async function crossSourceDedupSemantic(signals) {
  // First run the deterministic dedup.
  const base = crossSourceDedup(signals);
  if (!semanticDedupEnabled()) return base;
  if (!Array.isArray(base) || base.length < 2) return base;

  const thr = Number.parseFloat(process.env.RESILIENCE_SEMANTIC_DEDUP_THRESHOLD ?? '0.93');
  const threshold = Number.isFinite(thr) ? Math.min(0.999, Math.max(0.5, thr)) : 0.93;
  const model = embeddingModelId();

  const groups = new Map();
  for (const s of base) {
    const key = `${s.source_type ?? '_unknown'}|${s.signal_type ?? '_'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const out = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    const kept = [];
    const keptVecs = [];
    for (const s of list) {
      const ev = String(s?.evidence ?? '').trim();
      if (!ev) {
        kept.push(s);
        keptVecs.push(null);
        continue;
      }
      const v = await embedCached(ev, model);
      let merged = false;
      for (let i = 0; i < kept.length; i++) {
        if (!keptVecs[i]) continue;
        const sim = cosine(v, keptVecs[i]);
        if (sim >= threshold) {
          const existing = kept[i];
          const sw = (s.temporal_weight ?? 1) + reliabilityRank(s) * 0.01;
          const ew = (existing.temporal_weight ?? 1) + reliabilityRank(existing) * 0.01;
          if (sw > ew) {
            s._semantic_dedup_count = (existing._semantic_dedup_count ?? 1) + 1;
            kept[i] = s;
            keptVecs[i] = v;
          } else {
            existing._semantic_dedup_count = (existing._semantic_dedup_count ?? 1) + 1;
          }
          merged = true;
          break;
        }
      }
      if (!merged) {
        kept.push(s);
        keptVecs.push(v);
      }
    }
    out.push(...kept);
  }

  return out;
}

/**
 * Walk reports dir and return per-component score history for the trailing
 * `days` days BEFORE `targetDate` (i.e. excluding `targetDate` itself).
 *
 * @param {string} scope  'national' | 'north' — selects report file prefix
 */
export function loadHistoricalScores(targetDate, reportsDir = 'reports', days = 14, scope = 'national') {
  const dir = resolve(reportsDir);
  if (!existsSync(dir)) return {};
  const allFiles = readdirSync(dir);
  const targetTime = new Date(targetDate).getTime();
  if (Number.isNaN(targetTime)) return {};

  const matchesScope = (f, dStr) => {
    if (scope === 'north') {
      return f.startsWith(`resilience-report-north-${dStr}`) && f.endsWith('.json');
    }
    return f.startsWith(`resilience-report-${dStr}`)
      && !f.startsWith(`resilience-report-north-`)
      && f.endsWith('.json');
  };

  const seriesByComponent = {};
  const knownComponents = new Set();

  // First pass: collect the union of component_ids that appear anywhere in the
  // window so we can pad missing days with `null` for every component, not just
  // the ones that happened to score yesterday.
  const dailyPayload = new Array(days).fill(null);
  for (let i = 1; i <= days; i++) {
    const d = new Date(targetTime);
    d.setUTCDate(d.getUTCDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    const match = allFiles
      .filter((f) => matchesScope(f, dStr))
      .sort()
      .at(-1);
    if (!match) continue;
    try {
      const json = JSON.parse(readFileSync(resolve(dir, match), 'utf8'));
      const components = json.assessment?.components ?? [];
      const byId = {};
      for (const c of components) {
        knownComponents.add(c.component_id);
        byId[c.component_id] = c.score ?? null;
      }
      dailyPayload[i - 1] = byId;
    } catch {
      // leave dailyPayload[i-1] as null
    }
  }

  for (const id of knownComponents) seriesByComponent[id] = [];
  for (let i = 0; i < days; i++) {
    const payload = dailyPayload[i];
    for (const id of knownComponents) {
      const v = payload && id in payload ? payload[id] : null;
      seriesByComponent[id].push(v);
    }
  }
  return seriesByComponent;
}

/**
 * Load signal arrays from prior report JSON files (for data-void baseline volume).
 * Returns one array per day that had a report, oldest first.
 *
 * @param {string} targetDate YYYY-MM-DD
 * @param {string} [reportsDir]
 * @param {number} [days]
 * @param {'national'|'north'} [scope]
 * @returns {Array<Array<object>>}
 */
export function loadHistoricalSignalDays(targetDate, reportsDir = 'reports', days = 7, scope = 'national') {
  const dir = resolve(reportsDir);
  if (!existsSync(dir)) return [];
  const allFiles = readdirSync(dir);
  const targetTime = new Date(targetDate).getTime();
  if (Number.isNaN(targetTime)) return [];

  const matchesScope = (f, dStr) => {
    if (scope === 'north') {
      return f.startsWith(`resilience-report-north-${dStr}`) && f.endsWith('.json');
    }
    return f.startsWith(`resilience-report-${dStr}`)
      && !f.startsWith(`resilience-report-north-`)
      && f.endsWith('.json');
  };

  const out = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(targetTime);
    d.setUTCDate(d.getUTCDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    const match = allFiles
      .filter((f) => matchesScope(f, dStr))
      .sort()
      .at(-1);
    if (!match) continue;
    try {
      const json = JSON.parse(readFileSync(resolve(dir, match), 'utf8'));
      const signals = json.signals ?? [];
      if (Array.isArray(signals) && signals.length > 0) out.push(signals);
    } catch {
      // skip unreadable report
    }
  }
  return out;
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
 * Minimum non-null history points required before we trust a delta z-score.
 * Two-point std-dev was producing spurious "significant" flags on sparse
 * components — we now require a meaningful baseline. Configurable so the
 * threshold can be tuned without a code change.
 */
const DELTA_MIN_HISTORY = (() => {
  const raw = Number.parseInt(process.env.RESILIENCE_DELTA_MIN_HISTORY ?? '5', 10);
  return Number.isFinite(raw) && raw >= 2 ? raw : 5;
})();

/**
 * z-score of `today` against `history`. Returns null when fewer than the
 * configured minimum non-null history points are available or the series is
 * degenerate (zero variance). Null entries in `history` are filtered out.
 */
export function deltaSignificance(today, history) {
  if (today == null || !Array.isArray(history)) return null;
  const clean = history.filter((v) => v != null && Number.isFinite(v));
  if (clean.length < DELTA_MIN_HISTORY) return null;
  const sd = stddev(clean);
  if (sd === 0) return null;
  return (today - mean(clean)) / sd;
}

/**
 * Enrich the scoreComponents() result with `score_smoothed`, `delta_score`,
 * `delta_significance`, `delta_flag` for each component, using `history`
 * returned by loadHistoricalScores().
 *
 * Returns a NEW object (does not mutate the input).
 */
export function enrichWithDeltaChannel(scoredComponents, history = {}, opts = {}) {
  const scopeId = opts.scopeId ?? 'national';
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

    let delta_chronic = null;
    let z_score_chronic = null;
    let erosion_index = null;
    let exhaustion_days = null;
    let cumulative_deficit = null;

    if (isDualBaselineEnabled()) {
      const anchor = getPeaceTimeAnchor(scopeId, id);
      if (c.score != null && anchor != null) {
        delta_chronic = c.score - anchor;
        z_score_chronic = delta_chronic / 2;
      }
      if (c.score != null && anchor != null && score_smoothed != null) {
        erosion_index = Math.min(1, Math.max(0, (anchor - score_smoothed) / 10));
      }
      const lowDays = baseline.filter((v) => v != null && v < 4);
      exhaustion_days = lowDays.length;
      cumulative_deficit = lowDays.reduce((s, v) => s + (4 - v), 0);
    }

    out[id] = {
      ...c,
      score_smoothed,
      delta_score,
      delta_significance: sig != null ? Math.round(sig * 100) / 100 : null,
      delta_flag,
      ...(isDualBaselineEnabled() ? {
        delta_chronic,
        z_score_chronic: z_score_chronic != null ? Math.round(z_score_chronic * 100) / 100 : null,
        erosion_index: erosion_index != null ? Math.round(erosion_index * 1000) / 1000 : null,
        exhaustion_days,
        cumulative_deficit: cumulative_deficit != null ? Math.round(cumulative_deficit * 10) / 10 : null,
      } : {}),
    };
  }
  return out;
}
