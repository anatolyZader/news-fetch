import {
  normalizeForMatch,
  orderedSubsequenceContainment,
  resolveQuoteText,
  tokenize,
} from '../domain/services/textSimilarity.js';

const HEBREW_LETTER_RE = /[\u0590-\u05FF]/;

/**
 * @param {object} signal
 * @param {string} body
 * @returns {{ ok: boolean, reason: string, sim?: number }}
 */
export function verifyEvidenceSpan(signal, body) {
  const span = signal?.evidence_span;
  if (!span || typeof span !== 'object') {
    return { ok: false, reason: 'no_span' };
  }
  const start = Number(span.start);
  const end = Number(span.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    return { ok: false, reason: 'invalid_span' };
  }
  if (!body || typeof body !== 'string') {
    return { ok: false, reason: 'no_body' };
  }
  if (end > body.length) {
    return { ok: false, reason: 'span_out_of_bounds' };
  }
  const slice = body.slice(start, end);
  const quoteNorm = normalizeForMatch(resolveQuoteText(signal));
  const sliceNorm = normalizeForMatch(slice);
  if (!quoteNorm || !sliceNorm) {
    return { ok: false, reason: 'empty_span_text' };
  }
  if (quoteNorm === sliceNorm || sliceNorm.includes(quoteNorm) || quoteNorm.includes(sliceNorm)) {
    return { ok: true, reason: 'evidence_span', sim: 1 };
  }
  const evTokens = tokenize(slice);
  const quoteTokens = tokenize(resolveQuoteText(signal));
  const subseq = orderedSubsequenceContainment(quoteTokens, evTokens);
  if (subseq >= 0.8) {
    return { ok: true, reason: 'evidence_span_subseq', sim: subseq };
  }
  return { ok: false, reason: 'span_mismatch', sim: subseq };
}

/**
 * Source-native check: normalized substring or ordered subsequence in short bodies.
 * @param {string} quoteText
 * @param {string} sourceText
 * @returns {{ ok: boolean, reason: string, sim?: number }}
 */
export function verifySourceNativeQuote(quoteText, sourceText) {
  if (!quoteText || !sourceText) {
    return { ok: false, reason: 'empty_source_or_quote' };
  }
  const qNorm = normalizeForMatch(quoteText);
  const sNorm = normalizeForMatch(sourceText);
  if (!qNorm) return { ok: false, reason: 'empty_quote' };
  if (sNorm.includes(qNorm)) {
    return { ok: true, reason: 'source_native_substring', sim: 1 };
  }
  const evTokens = tokenize(quoteText);
  const bodyTokens = tokenize(sourceText);
  let threshold;
  if (evTokens.length <= 3) threshold = 1;
  else if (evTokens.length <= 8) threshold = 0.8;
  else threshold = 0.6;
  const subseq = orderedSubsequenceContainment(evTokens, bodyTokens);
  if (subseq >= threshold) {
    return { ok: true, reason: 'source_native_subsequence', sim: subseq };
  }
  return { ok: false, reason: 'source_native_miss', sim: subseq };
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

/** Jaccard similarity between two sets. Re-exported from domain textSimilarity. */
export { jaccard, tokenize, normalizeForMatch, orderedSubsequenceContainment, resolveQuoteText } from '../domain/services/textSimilarity.js';

/**
 * Containment of A in B = |A ∩ B| / |A|.
 */
export function containment(a, b) {
  if (!(a instanceof Set) || !(b instanceof Set)) return 0;
  if (a.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / a.size;
}

const VERIFY_THRESHOLDS = {
  direct_quote_named_person:   { containment: 0.7, windowContainment: 0.8 },
  named_survey_statistic:      { containment: 0.5 },
  named_institutional_fact:    { containment: 0.5 },
  observational_reported_fact: { containment: 0.4 },
  direct_evidence:             { containment: 0.6 },
  observational_evidence:      { containment: 0.4 },
};

const DEFAULT_THRESHOLD = { containment: 0.4 };

function bestWindowContainment(evTokens, bodyTokens, windowThreshold) {
  const evSet = new Set(evTokens);
  const W = Math.max(8, Math.min(evTokens.length * 2, 24));
  let best = 0;
  for (let i = 0; i + W <= bodyTokens.length; i++) {
    const winSet = new Set(bodyTokens.slice(i, i + W));
    const wc = containment(evSet, winSet);
    if (wc > best) best = wc;
    if (best >= windowThreshold) break;
  }
  return best;
}

function tryShortEvidenceMatch(evTokens, bodyTokens) {
  const subseq = orderedSubsequenceContainment(evTokens, bodyTokens);
  const subseqThreshold = evTokens.length <= 3 ? 1 : 0.8;
  if (subseq >= subseqThreshold) {
    return { ok: true, reason: 'ordered_subsequence', sim: subseq };
  }
  const bodySet = new Set(bodyTokens);
  let hits = 0;
  for (const t of evTokens) {
    if (bodySet.has(t)) hits++;
  }
  const overlap = hits / evTokens.length;
  if (overlap >= 0.6) return { ok: true, reason: 'short_overlap', sim: overlap };
  return null;
}

function verifyShingleContainment(signal, articleBody, quoteText) {
  const evTokens = tokenize(quoteText);
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

  if (cfg.windowContainment != null && bodyTokens.length > 0) {
    const best = bestWindowContainment(evTokens, bodyTokens, cfg.windowContainment);
    if (best >= cfg.windowContainment) {
      return { ok: true, reason: 'window', sim: best };
    }
  }

  if (evTokens.length <= 8) {
    const shortMatch = tryShortEvidenceMatch(evTokens, bodyTokens);
    if (shortMatch) return shortMatch;
  }

  return { ok: false, reason: 'low_similarity', sim };
}

/**
 * Verifies that a signal's evidence is grounded in the article body.
 * Checks evidence_span first, then shingle containment on resolveQuoteText(signal).
 *
 * Returns { ok: boolean, reason: string, sim?: number }.
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

  const quoteText = resolveQuoteText(signal);
  if (!quoteText.trim()) {
    return { ok: false, reason: 'empty_evidence' };
  }

  if (signal.evidence_span) {
    const spanResult = verifyEvidenceSpan(signal, articleBody);
    if (spanResult.ok) return spanResult;
  }

  return verifyShingleContainment(signal, articleBody, quoteText);
}

/**
 * Normalised key for in-batch dedup: collapses signals the LLM emitted twice
 * across grouped extraction passes (or by accident) into one entry.
 */
export function signalDedupKey(signal) {
  const norm = (signal.evidence ?? '')
    .toLowerCase()
    .replaceAll(/[^\w\u0590-\u05FF]/g, '')
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
