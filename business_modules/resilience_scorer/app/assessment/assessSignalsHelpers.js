/**
 * Pure helpers used by assess-signals.js. Extracted from the CLI so they can
 * be unit-tested without invoking the full pipeline.
 *
 *   - parseAssessCliArgs / discoverSignalBundles / loadAssessSignalFiles: CLI arg
 *       parsing and signal bundle discovery/loading for the assessment window.
 *   - temporalWeightForOffset / signalBundlesInAssessmentWindow: temporal weighting
 *       and recency caps per channel.
 *   - crossSourceDedup: collapses identical evidence republished across outlets.
 *   - blendWithYesterday / deltaSignificance: tiny stats helpers.
 *   - enrichWithDeltaChannel: adds smoothed score + delta + significance fields
 *       to each component in a scoreComponents() result.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { getPeaceTimeAnchor, isDualBaselineEnabled } from '../../domain/epistemic/peaceTimeAnchors.js';
import { recordOutletTelemetry } from '../../domain/services/outlets/outletReputationDecay.js';
import { enrichWithCalibrationPenalty, enrichWithWeightSensitivity } from '../scoringFacade.js';
import { embedText, embeddingsEnabled, embeddingModelId } from '../../../../cross-cut-modules/vector_index/index.js';
import { resilienceDedupClusterEnabled } from '../../../../cross-cut-modules/retrieval/ragConfig.js';
import { normalizeReportScope, reportScopeMetadata } from '../../domain/services/signals/regionSignalFilter.js';
import {
  ISRAEL_REGIONAL_DISTRICT_ORDER,
  normalizeIsraelDistrictId,
} from '../../../../cross-cut-modules/geo/israelDistricts.js';
import { isVisitsSourceType, normalizePipelineSourceKey, normalizeVisitsSourceType } from '../../domain/services/signals/visitsSourceType.js';

export const MAX_ASSESSMENT_DAYS = 14;

/** Placeholder bundle dates that must not enter the assessment window. */
export const INVALID_SIGNAL_BUNDLE_DATES = new Set(['1970-01-01']);

const PBO_BUNDLE_FILENAME_PATTERN =
  /^signals-pbo-(?:(north|south|jerusalem|haifa|dan)-)?(\d{4}-\d{2}-\d{2})\.json$/;
const STANDARD_BUNDLE_FILENAME_PATTERN = /^signals-(\w+)-(\d{4}-\d{2}-\d{2})\.json$/;

/**
 * @param {string} filename
 * @returns {{ sourceType: string, fileDate: string, districtId: string | null } | null}
 */
export function parseSignalBundleFilename(filename) {
  const base = String(filename ?? '').trim();
  const pbo = PBO_BUNDLE_FILENAME_PATTERN.exec(base);
  if (pbo) {
    return {
      sourceType: 'pbo',
      fileDate: pbo[2],
      districtId: pbo[1] ?? 'north',
    };
  }
  const std = STANDARD_BUNDLE_FILENAME_PATTERN.exec(base);
  if (!std) return null;
  const rawType = std[1];
  if (rawType === 'pbo') return null;
  const sourceType = normalizeVisitsSourceType(rawType);
  return {
    sourceType,
    fileDate: std[2],
    districtId: null,
  };
}

function buildRecencySource(sortedFiles, sourceType, targetDate, targetDates, retainLast) {
  const inWindow = [];
  for (const f of sortedFiles) {
    const parsed = parseSignalBundleFilename(f);
    if (!parsed || parsed.sourceType !== sourceType) continue;
    if (parsed.fileDate > targetDate || !targetDates.has(parsed.fileDate)) continue;
    inWindow.push(f);
  }
  const pick = retainLast == null ? inWindow : inWindow.slice(-retainLast);
  return new Set(pick);
}

/** All bundles for sourceType with basename date on or before targetDate (field visits: full history). */
function buildAllHistoricalSource(sortedFiles, sourceType, targetDate) {
  const out = [];
  for (const f of sortedFiles) {
    const parsed = parseSignalBundleFilename(f);
    if (!parsed || parsed.sourceType !== sourceType) continue;
    if (parsed.fileDate > targetDate) continue;
    out.push(f);
  }
  return new Set(out);
}

function buildRecencySources(sortedField, sortedRoot, sortedSocial, targetDate, targetDates, bundleCap) {
  return {
    visits: buildAllHistoricalSource(sortedField, 'visits', targetDate),
    field: buildAllHistoricalSource(sortedField, 'visits', targetDate),
    pbo: buildRecencySource(sortedRoot, 'pbo', targetDate, targetDates, bundleCap),
    pbo_regional: buildRecencySource(sortedRoot, 'pbo_regional', targetDate, targetDates, bundleCap),
    naftali: buildRecencySource(sortedRoot, 'naftali', targetDate, targetDates, 1),
    news: buildRecencySource(sortedRoot, 'news', targetDate, targetDates, bundleCap),
    radio: buildRecencySource(sortedRoot, 'radio', targetDate, targetDates, bundleCap),
    whatsapp: buildRecencySource(sortedRoot, 'whatsapp', targetDate, targetDates, bundleCap),
    social: buildRecencySource(sortedSocial, 'social', targetDate, targetDates, bundleCap),
  };
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

/** @param {number} dayOffset days before --date (0 = target day) */
export function temporalWeightForOffset(dayOffset) {
  if (dayOffset <= 0) return 1;
  if (dayOffset === 1) return 0.85;
  if (dayOffset === 2) return 0.7;
  const decay = 0.7 * Math.pow(0.7 / 0.85, dayOffset - 2);
  return Math.max(0.5, decay);
}

export function buildTargetDates(targetDate, days) {
  const targetDates = new Set();
  const base = new Date(targetDate);
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    targetDates.add(d.toISOString().slice(0, 10));
  }
  return targetDates;
}

const SOURCE_FILE_DATE_RE = /(\d{4}-\d{2}-\d{2})/;

/**
 * Build persisted assessment_window metadata for report JSON.
 * @param {string} reportDate YYYY-MM-DD
 * @param {number} days
 * @param {{ pipelinePreset?: string | null }} [opts]
 */
export function buildAssessmentWindowMetadata(reportDate, days, { pipelinePreset = null } = {}) {
  const safeDays = Math.min(MAX_ASSESSMENT_DAYS, Math.max(1, Number(days) || 1));
  const windowDates = [...buildTargetDates(reportDate, safeDays)].sort((a, b) => b.localeCompare(a));
  const out = {
    days: safeDays,
    report_date: reportDate,
    window_dates: windowDates,
    window_start: windowDates[windowDates.length - 1],
    window_end: windowDates[0],
  };
  if (pipelinePreset) out.pipeline_preset = pipelinePreset;
  return out;
}

/**
 * Legacy fallback: infer a consecutive signal window ending at report_date.
 * Non-consecutive bundle dates in source_files (re-extract history) are ignored.
 * @param {string} reportDate YYYY-MM-DD
 * @param {string[]} sourceFiles
 * @returns {{ assessment_days: number, window_start: string, window_end: string } | null}
 */
export function inferAssessmentWindowFromSourceFiles(reportDate, sourceFiles) {
  if (!reportDate || !Array.isArray(sourceFiles) || sourceFiles.length === 0) return null;

  const bundleDates = [...new Set(
    sourceFiles
      .map((f) => SOURCE_FILE_DATE_RE.exec(String(f))?.[1])
      .filter((d) => d && d <= reportDate),
  )];
  if (!bundleDates.includes(reportDate)) return null;

  const dateSet = new Set(bundleDates);
  let count = 0;
  let windowStart = reportDate;
  let cursor = reportDate;
  while (count < MAX_ASSESSMENT_DAYS) {
    if (!dateSet.has(cursor)) break;
    windowStart = cursor;
    count += 1;
    const prev = new Date(cursor);
    prev.setDate(prev.getDate() - 1);
    cursor = prev.toISOString().slice(0, 10);
  }
  if (count === 0) return null;
  return {
    assessment_days: count,
    window_start: windowStart,
    window_end: reportDate,
  };
}

/**
 * basename-dated bundles only inside { targetDates } ∩ { ≤ targetDate }.
 * `retainLast` keeps up to N newest-by-filename-date within that set (deterministic replay).
 */
export function signalBundlesInAssessmentWindow(sortedFilenames, regex, targetDate, targetDates, retainLast) {
  const inWindow = [];
  for (const f of sortedFilenames) {
    const m = regex.exec(f);
    if (!m) continue;
    const fd = m[1];
    if (fd > targetDate || !targetDates.has(fd)) continue;
    inWindow.push(f);
  }
  const pick = retainLast == null ? inWindow : inWindow.slice(-retainLast);
  return new Set(pick);
}

/**
 * @param {string[]} argv CLI args without node/script (e.g. process.argv.slice(2))
 */
export function parseAssessCliArgs(argv) {
  const args = argv;
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

  const targetDate = getArg('--date') ?? new Date().toISOString().slice(0, 10);
  const days = Math.min(MAX_ASSESSMENT_DAYS, Math.max(1, Number.parseInt(getArg('--days') ?? '1', 10)));
  const reportScopeId = normalizeReportScope(getArg('--scope') ?? 'national');
  const reportScope = reportScopeMetadata(reportScopeId);
  const outputArg = getArg('--output');
  const parsed = {
    targetDate,
    days,
    reportScopeId,
    reportScope,
    getArg,
  };
  if (outputArg != null) {
    parsed.outputBase = outputArg.replace(/\.(md|json)$/, '');
  }
  const bundleSource = getArg('--bundle-source')
    ?? process.env.ASSESS_BUNDLE_SOURCE
    ?? 'closed';
  parsed.bundleSource = bundleSource;
  parsed.observationsProfile = getArg('--observations-profile');
  return parsed;
}

/**
 * Discover signal bundle filenames inside the assessment window for each channel.
 */
export function discoverSignalBundles({
  targetDate,
  days,
  signalsDir,
  fieldSignalsDir,
  socialSignalsDir,
  enabledSources: _enabledSources,
}) {
  const signalsRootExists = existsSync(signalsDir);
  const fieldSignalsRootExists = existsSync(fieldSignalsDir);
  const socialSignalsRootExists = existsSync(socialSignalsDir);

  const rootFiles = signalsRootExists
    ? readdirSync(signalsDir).filter((f) => f.startsWith('signals-') && f.endsWith('.json'))
    : [];

  const fieldDirFiles = fieldSignalsRootExists
    ? readdirSync(fieldSignalsDir).filter((f) => f.startsWith('signals-') && f.endsWith('.json'))
    : [];

  const socialDirFiles = socialSignalsRootExists
    ? readdirSync(socialSignalsDir).filter((f) => f.startsWith('signals-social-') && f.endsWith('.json'))
    : [];

  const targetDates = buildTargetDates(targetDate, days);
  const bundleCap = days;

  const sortedFieldDirFiles = [...fieldDirFiles].sort((a, b) => a.localeCompare(b));
  const sortedRootFiles = [...rootFiles].sort((a, b) => a.localeCompare(b));
  const sortedSocialDirFiles = [...socialDirFiles].sort((a, b) => a.localeCompare(b));

  const recencySources = buildRecencySources(
    sortedFieldDirFiles,
    sortedRootFiles,
    sortedSocialDirFiles,
    targetDate,
    targetDates,
    bundleCap,
  );

  return {
    anyDirExists: signalsRootExists || fieldSignalsRootExists || socialSignalsRootExists,
    rootFiles,
    fieldDirFiles,
    socialDirFiles,
    targetDates,
    recencySources,
    bundleCap,
    signalsDir,
    fieldSignalsDir,
    socialSignalsDir,
  };
}

export function dateOffset(fileDate, targetDate) {
  const a = new Date(fileDate);
  const b = new Date(targetDate);
  return Math.round((b - a) / 86_400_000);
}

/**
 * @returns {{ enabledSources: Set<string>|null, pipelineConfig: object|null }}
 */
export function loadPipelineConfig(configPath) {
  let enabledSources = null;
  let pipelineConfig = null;
  if (!existsSync(configPath)) {
    return { enabledSources, pipelineConfig };
  }
  try {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    pipelineConfig = cfg;
    enabledSources = new Set(
      Object.entries(cfg.sources ?? {})
        .filter(([, v]) => v.enabled !== false)
        .map(([k]) => normalizePipelineSourceKey(k)),
    );
    const disabled = Object.entries(cfg.sources ?? {})
      .filter(([, v]) => v.enabled === false)
      .map(([k]) => k);
    if (disabled.length) console.log(`  ℹ Disabled sources (pipeline-config.json): ${disabled.join(', ')}`);
  } catch (e) {
    console.error(`  ⚠ Could not read pipeline-config.json: ${e.message}`);
  }
  return { enabledSources, pipelineConfig };
}

/**
 * Load signal JSON bundles matching the assessment window and recency caps.
 */
export function loadAssessSignalFiles({
  rootFiles,
  fieldDirFiles,
  socialDirFiles,
  signalsDir,
  fieldSignalsDir,
  socialSignalsDir,
  targetDate,
  targetDates,
  recencySources,
  enabledSources,
}) {
  const loadedFiles = [];

  function isSourceEnabledForLoad(sourceType) {
    if (!enabledSources) return true;
    if (sourceType === 'pbo_regional') return true;
    if (enabledSources.has(sourceType)) return true;
    if (sourceType === 'visits' && enabledSources.has('field')) return true;
    return false;
  }

  function tryLoadSignalFile(file, baseDir) {
    const parsed = parseSignalBundleFilename(file);
    if (!parsed) return;
    const { sourceType, fileDate, districtId: fileDistrictId } = parsed;
    if (INVALID_SIGNAL_BUNDLE_DATES.has(fileDate)) return;
    if (fileDate > targetDate) return;
    if (!isVisitsSourceType(sourceType) && !targetDates.has(fileDate)) return;
    if (!isSourceEnabledForLoad(sourceType)) return;
    const recencyKey = isVisitsSourceType(sourceType) ? 'visits' : sourceType;
    const recencySet = recencySources[recencyKey] ?? recencySources[sourceType];
    if (recencySet && !recencySet.has(file)) return;
    try {
      const data = JSON.parse(readFileSync(resolve(baseDir, file), 'utf8'));
      const offset = dateOffset(fileDate, targetDate);
      const weight = temporalWeightForOffset(offset);
      loadedFiles.push({ file, sourceType, fileDate, fileDistrictId, weight, data });
    } catch (e) {
      console.error(`  ⚠ Could not load ${file}: ${e.message}`);
    }
  }

  for (const file of [...rootFiles].sort((a, b) => a.localeCompare(b))) {
    const parsed = parseSignalBundleFilename(file);
    if (!parsed) continue;
    if (parsed.sourceType === 'visits' || parsed.sourceType === 'field' || parsed.sourceType === 'social') continue;
    tryLoadSignalFile(file, signalsDir);
  }

  for (const file of [...fieldDirFiles].sort((a, b) => a.localeCompare(b))) {
    const parsed = parseSignalBundleFilename(file);
    if (!parsed || !isVisitsSourceType(parsed.sourceType)) continue;
    tryLoadSignalFile(file, fieldSignalsDir);
  }

  for (const file of [...socialDirFiles].sort((a, b) => a.localeCompare(b))) {
    tryLoadSignalFile(file, socialSignalsDir);
  }

  return loadedFiles;
}

/** Merge loaded bundles into flat signal list with temporal weights. */
export function mergeLoadedSignalFiles(loadedFiles, { targetDate } = {}) {
  let allSignals = [];
  let totalArticles = 0;
  const sourceFiles = [];
  const sourceTypesSeen = new Set();

  for (const { weight, data, sourceType, fileDate, fileDistrictId } of loadedFiles) {
    const rawBundleDistrict = data.district_id ?? fileDistrictId;
    const bundleDistrict = rawBundleDistrict == null
      ? null
      : normalizeIsraelDistrictId(String(rawBundleDistrict));
    const bundleDistrictId = bundleDistrict
      && ISRAEL_REGIONAL_DISTRICT_ORDER.includes(bundleDistrict)
      ? bundleDistrict
      : null;
    const canonicalType = normalizeVisitsSourceType(sourceType);
    const weighted = (data.signals ?? []).map((s) => {
      let signalWeight = weight;
      if (targetDate && isVisitsSourceType(sourceType)) {
        const visitDate = String(s.article_date ?? fileDate).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
          signalWeight = temporalWeightForOffset(dateOffset(visitDate, targetDate));
        }
      }
      return {
        ...s,
        temporal_weight: signalWeight,
        source_type: canonicalType,
        signal_file_date: fileDate,
        ...(s.district_id == null && bundleDistrictId ? { district_id: bundleDistrictId } : {}),
      };
    });
    allSignals = allSignals.concat(weighted);
    totalArticles += data.total_articles ?? 0;
    sourceFiles.push(...(data.source_files ?? []));
    sourceTypesSeen.add(canonicalType);
  }

  return { allSignals, totalArticles, sourceFiles, sourceTypesSeen };
}

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
 * Optional semantic dedup: collapses paraphrased duplicates that slip past the
 * `normalisedEvidence` keying. Only dedups within the same (source_type, signal_type).
 *
 * Keeps the highest (temporal_weight, reliability) tuple, matching the intent
 * of crossSourceDedup. Marks the kept item with `_semantic_dedup_count`.
 */
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

/**
 * One-step blend: alpha * today + (1 - alpha) * yesterday's raw published
 * score, rounded to integer. NOT a recursive EWMA — each day blends two raw
 * scores and carries no exponential memory of earlier days.
 */
export function blendWithYesterday(today, yesterday, alpha) {
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

function computeDualBaselineExtras(c, componentId, scoreSmoothed, baseline, scopeId) {
  if (!isDualBaselineEnabled()) return null;

  const anchor = getPeaceTimeAnchor(scopeId, componentId);
  let delta_chronic = null;
  let z_score_chronic = null;
  let erosion_index = null;

  if (c.score != null && anchor != null) {
    delta_chronic = c.score - anchor;
    z_score_chronic = delta_chronic / 2;
  }
  if (c.score != null && anchor != null && scoreSmoothed != null) {
    erosion_index = Math.min(1, Math.max(0, (anchor - scoreSmoothed) / 10));
  }

  const lowDays = baseline.filter((v) => v != null && v < 4);
  return {
    delta_chronic,
    z_score_chronic: z_score_chronic == null ? null : Math.round(z_score_chronic * 100) / 100,
    erosion_index: erosion_index == null ? null : Math.round(erosion_index * 1000) / 1000,
    exhaustion_days: lowDays.length,
    cumulative_deficit: Math.round(lowDays.reduce((s, v) => s + (4 - v), 0) * 10) / 10,
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isEwmaFreezeOnEpistemicEnabled(env = process.env) {
  return env.RESILIENCE_EWMA_FREEZE_ON_EPISTEMIC !== '0';
}

/**
 * Enrich the scoreComponents() result with `score_smoothed`, `delta_score`,
 * `delta_significance`, `delta_flag` for each component, using `history`
 * returned by loadHistoricalScores().
 *
 * Returns a NEW object (does not mutate the input).
 */
function enrichOneComponent(id, c, history, scopeId, freezeTemporal = false) {
  if (freezeTemporal) {
    return {
      ...c,
      score_smoothed: c.score,
      delta_score: null,
      delta_significance: null,
      delta_flag: null,
    };
  }

  const series = history[id] ?? [];
  const yesterday = series[0] ?? null;
  const baseline = series.slice(0, 14);
  const alpha = 0.3 + 0.5 * (c.certainty ?? 0);
  const score_smoothed = blendWithYesterday(c.score, yesterday, alpha);
  const delta_score = c.score != null && yesterday != null ? c.score - yesterday : null;
  const sig = deltaSignificance(c.score, baseline);
  const delta_flag = sig != null && Math.abs(sig) > 2 ? 'significant' : null;
  const dualBaseline = computeDualBaselineExtras(c, id, score_smoothed, baseline, scopeId);

  const enriched = {
    ...c,
    score_smoothed,
    delta_score,
    delta_significance: sig == null ? null : Math.round(sig * 100) / 100,
    delta_flag,
  };
  return dualBaseline ? { ...enriched, ...dualBaseline } : enriched;
}

export function enrichWithDeltaChannel(scoredComponents, history = {}, opts = {}) {
  const scopeId = opts.scopeId ?? 'national';
  const freezeTemporal = opts.freezeTemporal === true;
  const out = {};
  for (const [id, c] of Object.entries(scoredComponents)) {
    out[id] = enrichOneComponent(id, c, history, scopeId, freezeTemporal);
  }
  return out;
}

/**
 * Post-scoring epistemic enrichment: calibration deficit + shadow weight sensitivity.
 * @param {Record<string, object>} scoredComponents
 * @param {Array<object>} signalsForScoring
 * @param {object} scoreOpts options for scoreComponents (totalArticles, salienceContext, mediaSignals)
 * @param {object|null|undefined} validationMaturity summarizeValidationMaturity() output
 */
export function enrichScoredComponentsEpistemic(
  scoredComponents,
  signalsForScoring,
  scoreOpts,
  validationMaturity,
) {
  const calResult = enrichWithCalibrationPenalty(scoredComponents, validationMaturity);
  const wsResult = enrichWithWeightSensitivity(
    calResult.scored,
    signalsForScoring,
    scoreOpts,
    { validationMaturity },
  );
  return {
    scored: wsResult.scored,
    calibration: calResult.calibration,
    overall_score_calibrated: calResult.overall_score_calibrated,
    weight_sensitivity_summary: wsResult.weight_sensitivity_summary,
    weight_sensitivity_note: wsResult.weight_sensitivity_note,
  };
}
