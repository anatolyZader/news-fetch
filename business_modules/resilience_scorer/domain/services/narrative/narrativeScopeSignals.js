/**
 * Narrative scope pool: scoped signals + scope-excluded national context (not scored).
 */
import { isRegionalReportScope } from '../../../../../cross-cut-modules/geo/reportScopeIds.js';
import {
  MACRO_NATIONAL_TERMS,
  SIGNAL_PROVENANCE,
} from '../signals/evidenceEligibility.js';
import { SIGNAL_TO_COMPONENTS } from '../signals/behaviorSignals.js';
import { scopeDecisionForSignal } from '../signals/regionSignalFilter.js';
import { isExcludedNationalContextSignalType } from '../signals/signalTypeHygiene.js';

const NATIONAL_PRESS_SOURCE_TYPES = new Set(['news', 'radio']);

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
  const n = Number.parseInt(env.RESILIENCE_NARRATIVE_NATIONAL_CAP ?? '60', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 60;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number|null}
 */
export function narrativeNationalCapPerDay(env = process.env) {
  const raw = env.RESILIENCE_NARRATIVE_NATIONAL_CAP_PER_DAY;
  if (raw == null || raw === '') return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : null;
}

/**
 * Stamp scopeDecision on every signal before regional filtering.
 * @param {object[]} signals
 * @param {string} reportScopeId
 * @returns {object[]}
 */
export function annotateScopeDecisions(signals, reportScopeId) {
  return (signals ?? []).map((s) => {
    if (!s || typeof s !== 'object') return s;
    const scopeDecision = scopeDecisionForSignal(s, reportScopeId);
    const merged = { ...s, scopeDecision };
    if (scopeDecision.macro_scope === 'national') {
      merged.macro_scope = 'national';
    }
    return merged;
  });
}

/**
 * @param {object} signal
 * @returns {boolean}
 */
function isValidExtractedSignal(signal) {
  const signalType = signal?.signal_type ?? signal?.type;
  const evidence = String(signal?.evidence ?? '').trim();
  return Boolean(signalType && evidence);
}

/**
 * @param {object} signal
 * @param {string} reportScopeId
 * @returns {number} 0 = tier A keyword, 1 = tier B press, -1 = not eligible
 */
function nationalContextTier(signal, reportScopeId) {
  if (!NATIONAL_PRESS_SOURCE_TYPES.has(signal?.source_type)) {
    if (evidenceMatchesMacroNationalTerms(signal?.evidence)) return 0;
    return -1;
  }
  const decision = signal?.scopeDecision ?? scopeDecisionForSignal(signal, reportScopeId);
  if (decision.isScopeRelevant) return -1;
  if (!isValidExtractedSignal(signal)) return -1;
  if (evidenceMatchesMacroNationalTerms(signal?.evidence)) return -1;
  return 1;
}

/**
 * Scope-excluded press/radio mentioning north/locality terms (regional press context).
 * @param {object} signal
 * @param {string} reportScopeId
 * @returns {boolean}
 */
function isRegionalPressContextCandidate(signal, reportScopeId) {
  if (!NATIONAL_PRESS_SOURCE_TYPES.has(signal?.source_type)) return false;
  if (!evidenceMatchesMacroNationalTerms(signal?.evidence)) return false;
  const decision = signal?.scopeDecision ?? scopeDecisionForSignal(signal, reportScopeId);
  if (decision.isScopeRelevant) return false;
  return isValidExtractedSignal(signal);
}

/**
 * @param {object} signal
 * @returns {number}
 */
function componentBreadth(signal) {
  const signalType = signal?.signal_type ?? signal?.type;
  const comps = SIGNAL_TO_COMPONENTS[signalType];
  return Array.isArray(comps) ? comps.length : 0;
}

/**
 * @param {object} signal
 * @returns {number}
 */
function confidenceRank(signal) {
  const raw = signal?.confidence ?? signal?.extraction_confidence;
  if (typeof raw === 'number') return raw;
  const map = { high: 0.9, medium: 0.6, low: 0.3 };
  return map[String(raw).toLowerCase()] ?? 0.5;
}

function sortRegionalPressCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const breadth = componentBreadth(b) - componentBreadth(a);
    if (breadth !== 0) return breadth;
    const temporal = (b.temporal_weight ?? 1) - (a.temporal_weight ?? 1);
    if (temporal !== 0) return temporal;
    return confidenceRank(b) - confidenceRank(a);
  });
}

/**
 * @param {object[]} candidates
 * @param {string} reportScopeId
 * @returns {object[]}
 */
function sortNationalContextCandidates(candidates, reportScopeId) {
  return [...candidates].sort((a, b) => {
    const tierA = nationalContextTier(a, reportScopeId);
    const tierB = nationalContextTier(b, reportScopeId);
    if (tierA !== tierB) return tierA - tierB;
    const breadth = componentBreadth(b) - componentBreadth(a);
    if (breadth !== 0) return breadth;
    const temporal = (b.temporal_weight ?? 1) - (a.temporal_weight ?? 1);
    if (temporal !== 0) return temporal;
    return confidenceRank(b) - confidenceRank(a);
  });
}

/**
 * @param {object} signal
 * @returns {string}
 */
function signalDayKey(signal) {
  const day = signal?.signal_file_date ?? signal?.article_date;
  if (day != null && String(day).trim()) {
    return String(day).slice(0, 10);
  }
  return '_unknown';
}

/**
 * @param {object[]} sorted
 * @param {number} totalCap
 * @param {number|null} perDayCap
 * @returns {object[]}
 */
function applyNationalContextCap(sorted, totalCap, perDayCap) {
  if (!perDayCap) {
    return sorted.slice(0, totalCap);
  }
  const perDay = new Map();
  const out = [];
  for (const s of sorted) {
    if (out.length >= totalCap) break;
    const day = signalDayKey(s);
    const count = perDay.get(day) ?? 0;
    if (count >= perDayCap) continue;
    perDay.set(day, count + 1);
    out.push(s);
  }
  return out;
}

/**
 * @param {object[]} allSignals
 * @param {string} reportScopeId
 * @param {Set<string>} scopedKeys
 * @param {{ cap?: number, perDayCap?: number|null }} [opts]
 * @returns {object[]}
 */
export function selectNarrativeNationalContext(allSignals, reportScopeId, scopedKeys, opts = {}) {
  if (!isRegionalReportScope(reportScopeId)) return [];

  const perDayCap = opts.perDayCap ?? narrativeNationalCapPerDay();
  const totalCap = opts.cap ?? narrativeNationalCap();
  const effectiveTotalCap = perDayCap ? Math.min(200, perDayCap * 7) : totalCap;

  const candidates = [];
  const seen = new Set(scopedKeys);

  for (const s of allSignals ?? []) {
    if (!s || typeof s !== 'object') continue;
    const key = signalDedupeKey(s);
    if (seen.has(key)) continue;
    if (nationalContextTier(s, reportScopeId) < 0) continue;
    if (isExcludedNationalContextSignalType(s)) continue;
    seen.add(key);
    candidates.push(s);
  }

  const sorted = sortNationalContextCandidates(candidates, reportScopeId);
  const picked = applyNationalContextCap(sorted, effectiveTotalCap, perDayCap);

  return picked.map((s) => ({
    ...s,
    signalProvenance: SIGNAL_PROVENANCE.narrative_national_context,
    metricsEligible: false,
    narrativeContextOnly: true,
  }));
}

/**
 * Scope-excluded press mentioning north/locality terms — investigation + narrative only.
 * @param {object[]} allSignals
 * @param {string} reportScopeId
 * @param {Set<string>} scopedKeys
 * @param {{ cap?: number, perDayCap?: number|null }} [opts]
 * @returns {object[]}
 */
export function selectRegionalPressContext(allSignals, reportScopeId, scopedKeys, opts = {}) {
  if (!isRegionalReportScope(reportScopeId)) return [];

  const perDayCap = opts.perDayCap ?? narrativeNationalCapPerDay();
  const totalCap = opts.cap ?? narrativeNationalCap();
  const effectiveTotalCap = perDayCap ? Math.min(200, perDayCap * 7) : totalCap;

  const candidates = [];
  const seen = new Set(scopedKeys);

  for (const s of allSignals ?? []) {
    if (!s || typeof s !== 'object') continue;
    const key = signalDedupeKey(s);
    if (seen.has(key)) continue;
    if (!isRegionalPressContextCandidate(s, reportScopeId)) continue;
    seen.add(key);
    candidates.push(s);
  }

  const sorted = sortRegionalPressCandidates(candidates);
  const picked = applyNationalContextCap(sorted, effectiveTotalCap, perDayCap);

  return picked.map((s) => ({
    ...s,
    signalProvenance: SIGNAL_PROVENANCE.regional_press_context,
    metricsEligible: false,
    narrativeContextOnly: true,
  }));
}

/**
 * @param {{ scopedSignals: object[], narrativeNationalContext: object[], regionalPressContext?: object[] }} params
 * @returns {object[]}
 */
export function buildNarrativeScopeSignals({
  scopedSignals = [],
  narrativeNationalContext = [],
  regionalPressContext = [],
}) {
  const out = [];
  const seen = new Set();
  for (const s of [...scopedSignals, ...regionalPressContext, ...narrativeNationalContext]) {
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
export function mergeNationalContextSignals(
  macroSignals = [],
  narrativeNationalContext = [],
  regionalPressContext = [],
) {
  const out = [];
  const seen = new Set();
  for (const s of [...macroSignals, ...regionalPressContext, ...narrativeNationalContext]) {
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
