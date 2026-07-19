/**
 * Signal-bundle discovery/loading/merging for the assessment window.
 * Filesystem-backed (like the rest of domain/services/paths) so both the app
 * assessment path and the infrastructure ISignalBundlePort adapters can share
 * it without an infrastructure → app dependency.
 */

import { resolve } from 'node:path';

import { resolveStateStore } from '../../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}

import {
  INVALID_SIGNAL_BUNDLE_DATES,
  buildTargetDates,
  dateOffset,
  parseSignalBundleFilename,
  temporalWeightForOffset,
} from './assessmentWindow.js';
import { isVisitsSourceType, normalizePipelineSourceKey, normalizeVisitsSourceType } from '../signals/visitsSourceType.js';
import {
  ISRAEL_REGIONAL_DISTRICT_ORDER,
  normalizeIsraelDistrictId,
} from '../../../../../cross-cut-modules/geo/israelDistricts.js';

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
  // 'field' is a legacy alias of 'visits' (see visitsSourceType.js) — same bundle set under both keys.
  const fieldVisitBundles = buildAllHistoricalSource(sortedField, 'visits', targetDate);
  return {
    visits: fieldVisitBundles,
    field: fieldVisitBundles,
    pbo: buildRecencySource(sortedRoot, 'pbo', targetDate, targetDates, bundleCap),
    pbo_regional: buildRecencySource(sortedRoot, 'pbo_regional', targetDate, targetDates, bundleCap),
    naftali: buildRecencySource(sortedRoot, 'naftali', targetDate, targetDates, 1),
    news: buildRecencySource(sortedRoot, 'news', targetDate, targetDates, bundleCap),
    radio: buildRecencySource(sortedRoot, 'radio', targetDate, targetDates, bundleCap),
    whatsapp: buildRecencySource(sortedRoot, 'whatsapp', targetDate, targetDates, bundleCap),
    social: buildRecencySource(sortedSocial, 'social', targetDate, targetDates, bundleCap),
  };
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
  const store = getStore();
  const signalsRootExists = store.existsSync(signalsDir);
  const fieldSignalsRootExists = store.existsSync(fieldSignalsDir);
  const socialSignalsRootExists = store.existsSync(socialSignalsDir);

  const rootFiles = signalsRootExists
    ? store.readdirSync(signalsDir).filter((f) => f.startsWith('signals-') && f.endsWith('.json'))
    : [];

  const fieldDirFiles = fieldSignalsRootExists
    ? store.readdirSync(fieldSignalsDir).filter((f) => f.startsWith('signals-') && f.endsWith('.json'))
    : [];

  const socialDirFiles = socialSignalsRootExists
    ? store.readdirSync(socialSignalsDir).filter((f) => f.startsWith('signals-social-') && f.endsWith('.json'))
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

/**
 * @returns {{ enabledSources: Set<string>|null, pipelineConfig: object|null }}
 */
export function loadPipelineConfig(configPath) {
  let enabledSources = null;
  let pipelineConfig = null;
  const store = getStore();
  if (!store.existsSync(configPath)) {
    return { enabledSources, pipelineConfig };
  }
  try {
    const cfg = JSON.parse(store.readFileSync(configPath, 'utf8'));
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
      const data = JSON.parse(getStore().readFileSync(resolve(baseDir, file), 'utf8'));
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
