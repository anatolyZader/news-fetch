/**
 * Priority-ranked, article-deduped signal pools for the user narrative pipeline.
 *
 * Pipeline position: narrative preflight — feeds signal ref registry and LLM facts/polish
 * prompts; ranking is count/quality-based (no evidence mass).
 *
 * Owns: per-component digest caps, evidence char limits, ranked signal picks.
 * Does NOT: run LLM calls or perform narrative grounding QA.
 *
 * Key collaborators: `user/topContributors.js`, `narrative/signalRefRegistry.js`,
 * `narrative/narrativePromptBudget.js`.
 */

import { COMPONENT_IDS } from '../../contracts/componentIds.js';
import { collectComponentSignals } from '../signals/componentSignalGroups.js';
import { contributorRankKey } from '../user/topContributors.js';
import { signalArticleKey } from './signalRefRegistry.js';

// ── Env caps ──────────────────────────────────────────────────────────────────

/**
 * Max signals per component in narrative digest (env RESILIENCE_NARRATIVE_DIGEST_SIGNALS).
 *
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
 * @param {object[]} items
 * @param {string} componentId
 * @param {number} cap
 */
function pickDigestItems(items, componentId, cap) {
  const sorted = [...items].sort(
    (a, b) => contributorRankKey(b.signal, componentId) - contributorRankKey(a.signal, componentId),
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

// ── Digest build ──────────────────────────────────────────────────────────────

/**
 * Build per-component ranked signal digest from narrative scope pool.
 *
 * @param {object[]} narrativeScopeSignals
 * @param {Record<string, object>|null} [evidenceFull] Evidence components for basis passthrough.
 * @param {{ digestCap?: number, evidenceChars?: number }} [opts]
 * @returns {Record<string, object>}
 */
export function buildFullSignalDigest(narrativeScopeSignals, evidenceFull = null, opts = {}) {
  const signals = narrativeScopeSignals ?? [];
  const cap = opts.digestCap ?? narrativeDigestSignalCap();
  const evidenceChars = opts.evidenceChars ?? narrativeDigestEvidenceChars();
  const out = {};

  for (const componentId of COMPONENT_IDS) {
    const { items } = collectComponentSignals(componentId, signals);
    const picked = pickDigestItems(items, componentId, cap);
    const componentSignals = picked.map((item) => {
      const signal = { ...item.signal };
      if (item.polarity === '-') signal._polarity = '-';
      return sliceEvidence(signal, evidenceChars);
    });

    const basis = evidenceFull?.[componentId]?.evidence_basis;
    out[componentId] = {
      ...(basis ? { evidence_basis: basis } : {}),
      signals: componentSignals,
      signal_count: componentSignals.length,
    };
  }

  return out;
}
