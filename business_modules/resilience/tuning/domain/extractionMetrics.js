/**
 * Pure metrics for evaluating signal extraction against a labeled corpus (N1).
 *
 * Definitions:
 *   - Signal-level matching: an extracted signal matches a gold signal iff their
 *     `signal_type` is identical AND the textual containment of the gold evidence
 *     in the extracted evidence (or vice versa) is ≥ `evidenceContainmentThreshold`.
 *   - Per-`signal_type` precision/recall/F1: aggregated across the corpus.
 *   - Cohen's κ: treats each (article, signal_type) pair as a presence/absence
 *     observation; gold and predicted are the two raters.
 *
 * No external dependencies — re-uses tokenize/shingles/containment from
 * signalVerification.js for evidence overlap.
 */

import {
  tokenize,
  shingles,
  containment,
} from '../../domain/services/textSimilarity.js';
import { SIGNAL_TYPES } from '../../domain/services/behaviorSignals.js';

const DEFAULT_EVIDENCE_THRESHOLD = 0.4; // 3-gram containment threshold for evidence-overlap match

/**
 * Match an extracted signal against a list of gold signals from the same article.
 * Returns the matched gold signal index or -1.
 */
function findMatch(extracted, golds, threshold) {
  if (!extracted) return -1;
  const exType = extracted.signal_type ?? extracted.type;
  if (!exType) return -1;
  const exShingles = shingles(tokenize(extracted.evidence ?? ''));
  let bestIdx = -1;
  let bestScore = -1;
  for (let i = 0; i < golds.length; i++) {
    const g = golds[i];
    if (g.__matched) continue;
    const gType = g.signal_type ?? g.type;
    if (gType !== exType) continue;
    const gShingles = shingles(tokenize(g.evidence ?? ''));
    // Check containment in BOTH directions (extracted ⊆ gold and gold ⊆ extracted)
    // since paraphrases can shorten OR lengthen the original. Best wins.
    const fwd = containment(gShingles, exShingles); // gold⊆extracted
    const bwd = containment(exShingles, gShingles); // extracted⊆gold
    const score = Math.max(fwd, bwd);
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function signalType(entry) {
  return entry.signal_type ?? entry.type;
}

function countGoldSupport(goldClone, bucket) {
  for (const g of goldClone) {
    const t = signalType(g);
    if (t) bucket(t).support++;
  }
}

function scorePredictions(predicted, goldClone, threshold, bucket) {
  for (const p of predicted) {
    const t = signalType(p);
    if (!t) continue;
    const idx = findMatch(p, goldClone, threshold);
    if (idx >= 0) {
      bucket(t).tp++;
      goldClone[idx].__matched = true;
    } else {
      bucket(t).fp++;
    }
  }
}

function countFalseNegatives(goldClone, bucket) {
  for (const g of goldClone) {
    if (g.__matched) continue;
    const t = signalType(g);
    if (t) bucket(t).fn++;
  }
}

function finalizeTypeMetrics(per_type) {
  let macroP = 0, macroR = 0, macroF = 0, macroN = 0;
  let microTp = 0, microFp = 0, microFn = 0;

  for (const [, b] of Object.entries(per_type)) {
    const p = b.tp + b.fp > 0 ? b.tp / (b.tp + b.fp) : 0;
    const r = b.tp + b.fn > 0 ? b.tp / (b.tp + b.fn) : 0;
    const f = p + r > 0 ? (2 * p * r) / (p + r) : 0;
    b.precision = round3(p);
    b.recall    = round3(r);
    b.f1        = round3(f);
    macroP += p; macroR += r; macroF += f; macroN++;
    microTp += b.tp; microFp += b.fp; microFn += b.fn;
  }

  const macro = macroN > 0
    ? { precision: round3(macroP / macroN), recall: round3(macroR / macroN), f1: round3(macroF / macroN) }
    : { precision: 0, recall: 0, f1: 0 };

  const microP = microTp + microFp > 0 ? microTp / (microTp + microFp) : 0;
  const microR = microTp + microFn > 0 ? microTp / (microTp + microFn) : 0;
  const microF = microP + microR > 0 ? (2 * microP * microR) / (microP + microR) : 0;
  const micro = {
    precision: round3(microP), recall: round3(microR), f1: round3(microF),
    tp: microTp, fp: microFp, fn: microFn,
  };

  return { macro, micro };
}

function predHasMatchingEvidence(predEntries, gold, t, threshold) {
  const goldClone = gold.filter((g) => signalType(g) === t)
    .map((g) => ({ ...g, __matched: false }));
  for (const p of predEntries) {
    const idx = findMatch(p, goldClone, threshold);
    if (idx >= 0) return true;
  }
  return false;
}

function kappaFromCounts({ n, bothYes, bothNo, goldYes, predYes }) {
  if (n === 0) return null;
  const Po = (bothYes + bothNo) / n;
  const pGold = goldYes / n;
  const pPred = predYes / n;
  const Pe = (pGold * pPred) + ((1 - pGold) * (1 - pPred));
  if (Pe === 1) {
    return (Po === 1) ? 1 : 0;
  }
  return (Po - Pe) / (1 - Pe);
}

function kappaCountsForType(pairs, t, threshold) {
  let n = 0;
  let bothYes = 0;
  let bothNo = 0;
  let goldYes = 0;
  let predYes = 0;

  for (const { gold = [], predicted = [] } of pairs) {
    n++;
    const goldHas = gold.some((g) => signalType(g) === t);
    const predEntries = predicted.filter((p) => signalType(p) === t);
    const predHas = predEntries.length > 0;

    if (goldHas) goldYes++;
    if (predHas) predYes++;

    if (goldHas && predHas && predHasMatchingEvidence(predEntries, gold, t, threshold)) {
      bothYes++;
    } else if (!goldHas && !predHas) {
      bothNo++;
    }
  }

  return { n, bothYes, bothNo, goldYes, predYes };
}

/**
 * Compute per-signal_type precision/recall/F1 over an aligned corpus.
 *
 * @param {Array<{gold: Array, predicted: Array}>} pairs — one entry per article.
 * @param {object} [opts]
 * @param {number} [opts.evidenceContainmentThreshold=0.4]
 * @returns {{
 *   per_type: { [signal_type]: { tp, fp, fn, precision, recall, f1, support } },
 *   macro: { precision, recall, f1 },
 *   micro: { precision, recall, f1, tp, fp, fn },
 * }}
 */
export function precisionRecallF1(pairs, opts = {}) {
  const threshold = opts.evidenceContainmentThreshold ?? DEFAULT_EVIDENCE_THRESHOLD;

  const per_type = {};
  function bucket(t) {
    if (!per_type[t]) per_type[t] = { tp: 0, fp: 0, fn: 0, support: 0 };
    return per_type[t];
  }

  for (const { gold = [], predicted = [] } of pairs) {
    const goldClone = gold.map((g) => ({ ...g, __matched: false }));
    countGoldSupport(goldClone, bucket);
    scorePredictions(predicted, goldClone, threshold, bucket);
    countFalseNegatives(goldClone, bucket);
  }

  const { macro, micro } = finalizeTypeMetrics(per_type);
  return { per_type, macro, micro };
}

/**
 * Per-signal-type Cohen's kappa for presence/absence per article.
 *
 * For each (article × signal_type) cell, gold and predicted are 1/0.
 * κ = (Po − Pe) / (1 − Pe) where Po is observed agreement and Pe is expected
 * agreement under independence.
 *
 * Returns:
 *   { per_type: {[t]: kappa}, macro_kappa: number }
 *
 * Pure presence/absence; the evidence-containment match is used to decide
 * whether predicted "saw the same signal" as gold (consistent with precisionRecallF1).
 */
export function cohensKappa(pairs, opts = {}) {
  const threshold = opts.evidenceContainmentThreshold ?? DEFAULT_EVIDENCE_THRESHOLD;
  const types = opts.signalTypes ?? SIGNAL_TYPES;
  const per_type = {};

  for (const t of types) {
    const counts = kappaCountsForType(pairs, t, threshold);
    per_type[t] = counts.n === 0 ? null : round3(kappaFromCounts(counts));
  }

  const observed = Object.values(per_type).filter((k) => k != null);
  const macro_kappa = observed.length > 0
    ? round3(observed.reduce((a, b) => a + b, 0) / observed.length)
    : 0;

  return { per_type, macro_kappa };
}

function round3(n) { return Math.round(n * 1000) / 1000; }

export const _evidenceContainmentThreshold = DEFAULT_EVIDENCE_THRESHOLD;
