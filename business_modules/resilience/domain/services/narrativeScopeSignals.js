/**
 * Narrative scope pool: scoped signals + scope-excluded national context (not scored).
 */
import { isRegionalReportScope } from '../../../../cross-cut-modules/geo/reportScopeIds.js';
import {
  MACRO_NATIONAL_TERMS,
  SIGNAL_PROVENANCE,
} from './evidenceEligibility.js';

/**
 * @param {object} signal
 * @returns {string}
 */
export function signalDedupeKey(signal) {
  const url = signal?.article_url;
  if (url != null && String(url).trim()) return `url:${String(url).trim()}`;
  const ev = signal?.evidence;
  if (ev != null && String(ev).trim()) return `ev:${String(ev).trim()}`;
  return `idx:${JSON.stringify(signal?.signal_type ?? signal?.type ?? 'unknown')}`;
}

/**
 * @param {string} evidence
 * @returns {boolean}
 */
export function evidenceMatchesMacroNationalTerms(evidence) {
  const text = String(evidence ?? '').toLowerCase();
  if (!text) return false;
  for (const term of MACRO_NATIONAL_TERMS) {
    if (text.includes(String(term).toLowerCase())) return true;
  }
  return false;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function narrativeNationalCap(env = process.env) {
  const n = Number.parseInt(env.RESILIENCE_NARRATIVE_NATIONAL_CAP ?? '40', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 40;
}

/**
 * Scope-excluded national signals relevant to north narrative (keyword path only).
 * @param {object[]} allSignals
 * @param {string} reportScopeId
 * @param {Set<string>} scopedKeys
 * @param {{ cap?: number }} [opts]
 * @returns {object[]}
 */
export function selectNarrativeNationalContext(allSignals, reportScopeId, scopedKeys, opts = {}) {
  if (!isRegionalReportScope(reportScopeId)) return [];

  const cap = opts.cap ?? narrativeNationalCap();
  const out = [];
  const seen = new Set(scopedKeys);

  for (const s of allSignals ?? []) {
    if (!s || typeof s !== 'object') continue;
    const key = signalDedupeKey(s);
    if (seen.has(key)) continue;
    if (!evidenceMatchesMacroNationalTerms(s.evidence)) continue;

    seen.add(key);
    out.push({
      ...s,
      signalProvenance: SIGNAL_PROVENANCE.narrative_national_context,
      metricsEligible: false,
      narrativeContextOnly: true,
    });
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * @param {{ scopedSignals: object[], narrativeNationalContext: object[] }} params
 * @returns {object[]}
 */
export function buildNarrativeScopeSignals({ scopedSignals = [], narrativeNationalContext = [] }) {
  const out = [];
  const seen = new Set();
  for (const s of [...scopedSignals, ...narrativeNationalContext]) {
    if (!s || typeof s !== 'object') continue;
    const key = signalDedupeKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Build scoped-key set from scoped signals.
 * @param {object[]} scopedSignals
 * @returns {Set<string>}
 */
export function scopedSignalKeys(scopedSignals) {
  return new Set((scopedSignals ?? []).map((s) => signalDedupeKey(s)));
}

/**
 * Slim shape for operator national context UI.
 * @param {object} signal
 * @returns {object}
 */
export function slimNationalContextSignal(signal) {
  return {
    signal_type: signal?.signal_type ?? signal?.type ?? null,
    evidence: signal?.evidence ?? '',
    signalProvenance: signal?.signalProvenance ?? null,
    source_type: signal?.source_type ?? null,
  };
}

/**
 * Merge macro + narrative national context for assessment persistence.
 * @param {object[]} macroSignals
 * @param {object[]} narrativeNationalContext
 * @returns {object[]}
 */
export function mergeNationalContextSignals(macroSignals = [], narrativeNationalContext = []) {
  const out = [];
  const seen = new Set();
  for (const s of [...macroSignals, ...narrativeNationalContext]) {
    if (!s || typeof s !== 'object') continue;
    const key = signalDedupeKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slimNationalContextSignal(s));
  }
  return out;
}

/**
 * @param {object[]} nationalContextSignals
 * @returns {{ count: number, provenance_counts: Record<string, number> }}
 */
export function summarizeNationalContext(nationalContextSignals) {
  const provenance_counts = {};
  for (const s of nationalContextSignals ?? []) {
    const p = s?.signalProvenance ?? 'unknown';
    provenance_counts[p] = (provenance_counts[p] ?? 0) + 1;
  }
  return {
    count: (nationalContextSignals ?? []).length,
    provenance_counts,
  };
}
