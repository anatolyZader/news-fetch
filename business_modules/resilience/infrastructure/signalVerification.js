/**
 * Pure helpers for signal-quality controls in the extraction pipeline:
 *   - verifyEvidenceAgainstArticle: Jaccard-based check that the LLM's `evidence`
 *     field actually traces to the source article body (E1 evidence verifier).
 *   - dedupeSignalsWithinBatch: collapses signals that the multi-pass extraction
 *     emitted from more than one domain pass (E2 grouped passes).
 *
 * No LLM dependency; safe to import in tests.
 */

const HEBREW_LETTER_RE = /[\u0590-\u05FF]/;

/**
 * Lowercased word tokens; keeps Hebrew block, ASCII letters, digits.
 * Punctuation and quotes are dropped (so paraphrased evidence still matches).
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\u0590-\u05FF\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** k-gram shingle set over a token array. */
export function shingles(tokens, k = 3) {
  if (!Array.isArray(tokens) || tokens.length === 0) return new Set();
  if (tokens.length < k) return new Set([tokens.join(' ')]);
  const out = new Set();
  for (let i = 0; i <= tokens.length - k; i++) {
    out.add(tokens.slice(i, i + k).join(' '));
  }
  return out;
}

/** Jaccard similarity between two sets. */
export function jaccard(a, b) {
  if (!(a instanceof Set) || !(b instanceof Set)) return 0;
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Containment of A in B = |A ∩ B| / |A|.
 *
 * For evidence verification this is more appropriate than symmetric Jaccard:
 * evidence is short, articles are long, so |A ∩ B| / |A| measures
 * "how much of the evidence is supported by the article" — which is what we
 * actually want to test, not "how similar are these two texts".
 */
export function containment(a, b) {
  if (!(a instanceof Set) || !(b instanceof Set)) return 0;
  if (a.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / a.size;
}

const VERIFY_THRESHOLDS = {
  direct_quote_named_person:   { containment: 0.70, windowContainment: 0.80 },
  named_survey_statistic:      { containment: 0.50 },
  named_institutional_fact:    { containment: 0.50 },
  observational_reported_fact: { containment: 0.40 },
  // Legacy fallbacks
  direct_evidence:             { containment: 0.60 },
  observational_evidence:      { containment: 0.40 },
};

const DEFAULT_THRESHOLD = { containment: 0.40 };

/**
 * Verifies that a signal's `evidence` is grounded in the article body.
 *
 * Returns { ok: boolean, reason: string, sim?: number }.
 *
 * Rules:
 *   - evidence_basis === 'inferred_absence' → bypass (absence isn't quotable).
 *   - empty article body → bypass (cannot verify; trust upstream filter).
 *   - direct_quote_named_person: pass if global 3-gram Jaccard ≥ 0.5 OR a
 *     sliding window of size max(8, |evTokens|) on the body has Jaccard ≥ 0.7
 *     against the evidence token set.
 *   - other types: pass if global 3-gram Jaccard ≥ type-specific threshold.
 */
export function verifyEvidenceAgainstArticle(signal, articleBody) {
  if (!signal || typeof signal !== 'object') {
    return { ok: false, reason: 'invalid_signal' };
  }
  if (signal.evidence_basis === 'inferred_absence') {
    return { ok: true, reason: 'inferred_absence' };
  }
  if (!articleBody || typeof articleBody !== 'string') {
    return { ok: true, reason: 'no_body' };
  }

  const evTokens = tokenize(signal.evidence ?? '');
  if (evTokens.length === 0) {
    return { ok: false, reason: 'empty_evidence' };
  }
  const bodyTokens = tokenize(articleBody);
  if (bodyTokens.length === 0) return { ok: true, reason: 'no_body' };

  const evShingles = shingles(evTokens);
  const bodyShingles = shingles(bodyTokens);
  const sim = containment(evShingles, bodyShingles);

  const cfg = VERIFY_THRESHOLDS[signal.evidence_type] ?? DEFAULT_THRESHOLD;
  if (sim >= cfg.containment) return { ok: true, reason: 'containment', sim };

  // Secondary window check for direct quotes: slide a 24-token window over the
  // body and compute token-level containment of the evidence in each window.
  // This catches quoted sentences buried in long bodies where global shingle
  // containment may be diluted by surrounding content.
  if (cfg.windowContainment != null && bodyTokens.length > 0) {
    const evSet = new Set(evTokens);
    const W = Math.max(8, Math.min(evTokens.length * 2, 24));
    let best = 0;
    for (let i = 0; i + W <= bodyTokens.length; i++) {
      const winSet = new Set(bodyTokens.slice(i, i + W));
      const wc = containment(evSet, winSet);
      if (wc > best) best = wc;
      if (best >= cfg.windowContainment) break;
    }
    if (best >= cfg.windowContainment) {
      return { ok: true, reason: 'window', sim: best };
    }
  }

  // Short-evidence fallback: at most 8 tokens, accept if 60% appear in body.
  // Covers paraphrased facts so terse they generate few or no shingles.
  if (evTokens.length <= 8) {
    const bodySet = new Set(bodyTokens);
    let hits = 0;
    for (const t of evTokens) {
      if (bodySet.has(t)) hits++;
    }
    const overlap = hits / evTokens.length;
    if (overlap >= 0.6) return { ok: true, reason: 'short_overlap', sim: overlap };
  }

  return { ok: false, reason: 'low_similarity', sim };
}

/**
 * Normalised key for in-batch dedup: collapses signals the LLM emitted twice
 * across grouped extraction passes (or by accident) into one entry.
 */
export function signalDedupKey(signal) {
  const norm = (signal.evidence ?? '')
    .toLowerCase()
    .replace(/[^\w\u0590-\u05FF]/g, '')
    .slice(0, 80);
  return `${signal.article_index ?? '_'}|${signal.signal_type ?? '_'}|${norm}`;
}

/**
 * Collapse duplicate signals produced by independent extraction passes.
 * Keeps the first occurrence; later ones are dropped.
 */
export function dedupeSignalsWithinBatch(signals) {
  const seen = new Map();
  for (const s of signals) {
    const key = signalDedupKey(s);
    if (!seen.has(key)) seen.set(key, s);
  }
  return [...seen.values()];
}

/** Diagnostic: returns true if the text contains any Hebrew character. */
export function containsHebrew(text) {
  return typeof text === 'string' && HEBREW_LETTER_RE.test(text);
}
