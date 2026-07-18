/**
 * Signal dedup for the assessment window: within-source keying, deterministic
 * cross-source dedup, and the optional semantic/story-cluster variants.
 */

import { createHash } from 'node:crypto';

import { recordOutletTelemetry } from '../../domain/services/outlets/outletReputationDecay.js';
import { embedText, embeddingsEnabled, embeddingModelId } from '../../../../cross-cut-modules/vector_index/index.js';
import { resilienceDedupClusterEnabled } from '../../../../cross-cut-modules/retrieval/ragConfig.js';

/** Within-source dedup: keep highest temporal_weight per key. */
export function dedupWithinSource(allSignals) {
  const seen = new Map();
  for (const s of allSignals) {
    const normEvidence = (s.evidence ?? '').replaceAll(/[^\w\u0590-\u05FF]/g, '').toLowerCase().slice(0, 80);
    const key = `${s.signal_type}|${s.article_source ?? ''}|${normEvidence}`;
    const existing = seen.get(key);
    if (!existing || (s.temporal_weight ?? 1) > (existing.temporal_weight ?? 1)) {
      seen.set(key, s);
    }
  }
  const beforeCount = allSignals.length;
  const deduped = [...seen.values()];
  if (deduped.length < beforeCount) {
    console.error(`  Within-source dedup: ${beforeCount} → ${deduped.length} (${beforeCount - deduped.length} duplicates removed)`);
  }
  return deduped;
}

/** Lower-cased, punctuation-free first 120 chars of evidence — stable for keying. */
function normalisedEvidence(s) {
  return (s.evidence ?? '')
    .toLowerCase()
    .replaceAll(/[^\w\u0590-\u05FF]/g, '')
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

function semanticWeight(s) {
  return (s.temporal_weight ?? 1) + reliabilityRank(s) * 0.01;
}

async function mergeSemanticDuplicate(kept, keptVecs, s, threshold, v) {
  for (let i = 0; i < kept.length; i++) {
    if (!keptVecs[i]) continue;
    const sim = cosine(v, keptVecs[i]);
    if (sim < threshold) continue;

    const existing = kept[i];
    if (semanticWeight(s) > semanticWeight(existing)) {
      s._semantic_dedup_count = (existing._semantic_dedup_count ?? 1) + 1;
      kept[i] = s;
      keptVecs[i] = v;
    } else {
      existing._semantic_dedup_count = (existing._semantic_dedup_count ?? 1) + 1;
    }
    return true;
  }
  return false;
}

async function dedupSemanticGroup(list, threshold, model) {
  if (list.length === 1) return list;

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
    const merged = await mergeSemanticDuplicate(kept, keptVecs, s, threshold, v);
    if (!merged) {
      kept.push(s);
      keptVecs.push(v);
    }
  }
  return kept;
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
    if (sw > ew) {
      if (existing.article_source) recordOutletTelemetry(existing.article_source, { dedupHits: 1 });
      seen.set(key, s);
    } else if (s.article_source) {
      recordOutletTelemetry(s.article_source, { dedupHits: 1 });
    }
  }
  return [...seen.values()];
}

function semanticDedupEnabled() {
  if (process.env.RESILIENCE_SEMANTIC_DEDUP === '0') return false;
  return embeddingsEnabled();
}

/**
 * Cross-source dedup via persistent story-cluster index (replaces pairwise semantic scan when enabled).
 * @param {Array<object>} signals
 * @param {{ storyClusterIndex?: object|null }} [opts]
 */
export async function crossSourceDedupClustered(signals, opts = {}) {
  const base = crossSourceDedup(signals);
  const index = opts.storyClusterIndex;
  if (!resilienceDedupClusterEnabled() || !index?.upsertSignals) {
    return crossSourceDedupSemantic(signals);
  }
  await index.upsertSignals(base);
  return index.collapseSignals(base);
}

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
    out.push(...await dedupSemanticGroup(list, threshold, model));
  }

  return out;
}
