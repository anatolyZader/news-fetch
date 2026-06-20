/**
 * Mass-ranked, article-deduped signal pools for the operator narrative pipeline only.
 * Agent assessment uses compact evidence-graph claims; narrative uses this digest.
 */
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { buildDuplicateOccurrenceIndex } from '../epistemic/massContribution.js';
import { collectComponentItems } from '../epistemic/componentItems.js';
import { defaultSignalWeights } from '../epistemic/signalWeights.js';
import { signalArticleKey } from './narrativeGrounding/signalRefRegistry.js';

const SUPPRESSION_KEYS = [
  'suppression_delta',
  'source_cap_binding',
  'floor_clamped',
  'suppression_breakdown',
  'score_raw',
  'score_headline',
  'score',
  'positive_evidence',
  'negative_evidence',
  'derived_indicators',
];

/**
 * @returns {number}
 */
export function narrativeDigestSignalCap() {
  const n = Number.parseInt(process.env.RESILIENCE_NARRATIVE_DIGEST_SIGNALS ?? '15', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 15;
}

/**
 * @returns {number}
 */
export function narrativeDigestEvidenceChars() {
  const n = Number.parseInt(process.env.RESILIENCE_NARRATIVE_DIGEST_EVIDENCE_CHARS ?? '500', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : 500;
}

/**
 * @param {object|null|undefined} scoredFull
 * @param {string} componentId
 * @returns {object}
 */
function suppressionSliceFromScored(scoredFull, componentId) {
  const scored = scoredFull?.[componentId];
  if (!scored || typeof scored !== 'object') return {};
  const out = {};
  for (const key of SUPPRESSION_KEYS) {
    if (scored[key] != null) out[key] = scored[key];
  }
  return out;
}

/**
 * @param {object[]} items
 * @param {number} cap
 */
function pickDigestItems(items, cap) {
  const sorted = [...items].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
  );
  const seenArticles = new Set();
  const picked = [];
  for (const item of sorted) {
    const key = signalArticleKey(item.signal);
    if (seenArticles.has(key)) continue;
    seenArticles.add(key);
    picked.push(item);
    if (picked.length >= cap) break;
  }
  return picked;
}

/**
 * @param {object} signal
 * @param {number} maxChars
 */
function sliceEvidence(signal, maxChars) {
  if (signal.evidence == null) return signal;
  return { ...signal, evidence: String(signal.evidence).slice(0, maxChars) };
}

/**
 * @param {object[]} narrativeScopeSignals
 * @param {Record<string, object>|null} [scoredFull]
 * @returns {Record<string, { signals: object[], signal_count: number }>}
 */
export function buildFullSignalDigest(narrativeScopeSignals, scoredFull = null) {
  const signals = narrativeScopeSignals ?? [];
  const signalWeights = defaultSignalWeights();
  const duplicateIndex = buildDuplicateOccurrenceIndex(signals);
  const cap = narrativeDigestSignalCap();
  const evidenceChars = narrativeDigestEvidenceChars();
  const out = {};

  for (const componentId of COMPONENT_IDS) {
    const { items } = collectComponentItems(componentId, signals, duplicateIndex, signalWeights);
    const picked = pickDigestItems(items, cap);
    const componentSignals = picked.map((item) => {
      const signal = { ...item.signal, _contribution: item.contribution };
      if (item.polarity === '-') signal._polarity = '-';
      return sliceEvidence(signal, evidenceChars);
    });

    out[componentId] = {
      ...suppressionSliceFromScored(scoredFull, componentId),
      signals: componentSignals,
      signal_count: componentSignals.length,
    };
  }

  return out;
}
