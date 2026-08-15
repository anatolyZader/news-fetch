/**
 * Shared dependencies for the assess-signals CLI: safe service factories,
 * probe/dedup/geo helpers, and signal bundle loading.
 * Extracted verbatim from assessSignalsCli.js (behavior-preserving split).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  crossSourceDedupClustered,
  loadPipelineConfig,
  mergeLoadedSignalFiles,
  dedupWithinSource,
  collapseNewsEvents,
} from './assessSignalsHelpers.js';
import { PBO_CONTRACT_GATE_BLOCK_ENV_KEY } from '../../domain/services/paths/pboBundleContract.js';
import { createPboReviewStatePort } from './createPboReviewStatePort.js';
import {
  pboDatesInSignals,
  resolvePboReviewStates,
} from '../../domain/services/signals/pboReviewStateResolution.js';
import { enrichSignalsGeoIfNeeded } from '../../../../cross-cut-modules/geo/enrichSignalsGeoIfNeeded.js';
import { resolveSqlitePath } from '../../../../cross-cut-modules/config/sqlitePath.js';
import { loadConnectivityProbeSignals, loadProbeRecordsForDate } from '../../infrastructure/adapters/connectivityProbeFileAdapter.js';
import { enrichProbeSignalsInList } from '../../domain/services/signals/probeCorroborationPolicy.js';
import { createSourceArchive } from '../../../../db/source_archive/createSourceArchive.js';
import { archiveProbeRecords } from '../../../../db/source_archive/archiveProbeRecords.js';
import { createRetrievalService } from '../../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { createSignalBundlePort } from './createSignalBundlePort.js';
import { closedSignalsDir } from '../../domain/contracts/index.js';
import { loadOpenObservationsForAssess } from './loadOpenObservationsForAssess.js';
import { isOmissionAuditEnabled } from '../../domain/services/oov/openExtractConfig.js';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const SIGNAL_DIRS = {
  signalsDir: closedSignalsDir(),
  visitsSignalsDir: resolve('business_modules', 'visits', 'data', 'signals'),
  socialSignalsDir: resolve('business_modules', 'social_media', 'data'),
};

export function formatDaysSuffix(days) {
  return days > 1 ? ` (last ${days} days)` : '';
}

function contentKindFromSourceTypes(sourceTypesSeen) {
  if (sourceTypesSeen.size > 1) return 'mixed';
  if (sourceTypesSeen.has('radio')) return 'audio';
  return 'news';
}

// Moved to infrastructure/reportHistoryReader.js (v10, injectable reportsDir);
// re-exported here so existing callers keep working.
export { loadPriorReports } from '../../infrastructure/reportHistoryReader.js';

function assertSignalBundles(bundlePort, discovery, useObservations) {
  if (bundlePort.hasAnySource(discovery)) return;
  if (useObservations) {
    throw new Error('No observation bundles found. Run: npm run extract-observations -- ...');
  }
  throw new Error('No signals directories found. Run extract-signals.js first.');
}

function assertLoadedSignalFiles(loadedFiles, useObservations, targetDate, days) {
  if (loadedFiles.length > 0) return;
  const suffix = formatDaysSuffix(days);
  if (useObservations) {
    throw new Error(
      `No mapped observation bundles for ${targetDate}${suffix}. ` +
      'Ensure observations have suggested_catalog_types matching SIGNAL_CATALOG.',
    );
  }
  throw new Error(
    `No signal files found for ${targetDate}${suffix}. ` +
    `Expected files like: signals/signals-news-${targetDate}.json`,
  );
}

function mergeConnectivityProbeSignals(allSignals, sourceTypesSeen, targetDate) {
  const probeSignals = loadConnectivityProbeSignals(targetDate, 'national');
  if (probeSignals.length === 0) return allSignals;
  sourceTypesSeen.add('infrastructure_probe');
  console.error(`  → Connectivity probes: ${probeSignals.length} signal(s) merged`);
  return [...allSignals, ...probeSignals];
}

function archiveProbeRecordsForDate(targetDate) {
  try {
    const sqlitePath = resolveSqlitePath(process.env, REPO_ROOT);
    const archive = createSourceArchive(sqlitePath);
    const records = loadProbeRecordsForDate(targetDate, 'national');
    const n = archiveProbeRecords(archive, records, targetDate);
    archive.close();
    if (n > 0) console.error(`  → ${n} probe original(s) archived`);
  } catch (err) {
    console.error(`  ⚠ Probe archive skipped: ${err.message}`);
  }
}

/**
 * Overlay live municipal review verdicts onto already-extracted PBO signals.
 *
 * The extract-time stamp is written before the review workflow runs, so on a
 * same-day run every municipality is frozen as `unreviewed`. Fail-open: any
 * problem here leaves the stamped values in place.
 *
 * @param {Array<object>} allSignals
 * @returns {Promise<Array<object>>}
 */
async function refreshPboReviewStates(allSignals) {
  const dates = pboDatesInSignals(allSignals);
  if (dates.length === 0) return allSignals;
  try {
    const port = await createPboReviewStatePort();
    if (!port) return allSignals;
    const stateByKey = await port.loadReviewStates(dates);
    const { signals, changed, resolved } = resolvePboReviewStates(allSignals, stateByKey);
    if (changed > 0) {
      console.error(`  → PBO review state refreshed at assess time: ${changed} of ${resolved} matched signal(s) changed`);
    }
    return signals;
  } catch (err) {
    console.error(`  ⚠ PBO review refresh skipped: ${err.message}`);
    return allSignals;
  }
}

export function createSourceArchiveSafe() {
  try {
    const sqlitePath = resolveSqlitePath(process.env, REPO_ROOT);
    return createSourceArchive(sqlitePath);
  } catch (err) {
    console.error(`  ⚠ Source archive unavailable: ${err.message}`);
    return null;
  }
}

function createRetrievalServiceSafe() {
  try {
    const sqlitePath = resolveSqlitePath(process.env, REPO_ROOT);
    return createRetrievalService({ dbPath: sqlitePath });
  } catch (err) {
    console.error(`  ⚠ Retrieval service unavailable: ${err.message}`);
    return null;
  }
}

async function dedupSignalsCrossSource(allSignals, retrievalService) {
  const beforeCrossSource = allSignals.length;
  const deduped = await crossSourceDedupClustered(allSignals, {
    storyClusterIndex: retrievalService?.storyClusterIndex ?? null,
  });
  if (deduped.length < beforeCrossSource) {
    console.error(`  Cross-source merged: ${beforeCrossSource} → ${deduped.length} (${beforeCrossSource - deduped.length} cross-outlet duplicates collapsed)`);
  }
  return deduped;
}

function enrichSignalsGeoForAssess(allSignals) {
  return enrichSignalsGeoIfNeeded(allSignals, {
    rootDir: REPO_ROOT,
    unknownSourceType: 'assess-signals',
  });
}

export async function loadPreparedSignals(targetDate, days, bundleOpts = {}) {
  const bundlePort = await createSignalBundlePort({
    bundleSource: bundleOpts.bundleSource ?? 'closed',
    observationsProfile: bundleOpts.observationsProfile ?? null,
    signalDirs: SIGNAL_DIRS,
  });

  const { enabledSources: configSources, pipelineConfig } = loadPipelineConfig(
    resolve('pipeline-config.json'),
  );
  const useObservations = (bundleOpts.bundleSource ?? 'closed') === 'observations';
  const enabledSources = useObservations ? null : configSources;

  const discovery = bundlePort.discoverBundles({ targetDate, days, enabledSources });

  assertSignalBundles(bundlePort, discovery, useObservations);

  const loadedFiles = bundlePort.loadBundles(discovery, { targetDate, enabledSources });

  assertLoadedSignalFiles(loadedFiles, useObservations, targetDate, days);

  let merged;
  try {
    merged = mergeLoadedSignalFiles(loadedFiles, { targetDate });
  } catch (err) {
    if (err?.code === 'stale_pbo_bundle_contract') {
      const files = err.files ?? [];
      throw new Error(
        `${files.length} PBO bundle(s) predate the current extractor and would reproduce its `
        + `one-signal-per-component output: ${files.join(', ')} — re-extract with `
        + `\`node business_modules/pbo_report/input/extract-pbo-signals.js --date <date> --force\`, `
        + `or set ${PBO_CONTRACT_GATE_BLOCK_ENV_KEY}=0 to load them anyway`,
        { cause: err },
      );
    }
    throw err;
  }
  let { allSignals, totalArticles, sourceFiles, sourceTypesSeen, hygieneDrops } = merged;
  allSignals = await refreshPboReviewStates(allSignals);
  allSignals = mergeConnectivityProbeSignals(allSignals, sourceTypesSeen, targetDate);
  archiveProbeRecordsForDate(targetDate);
  allSignals = enrichProbeSignalsInList(allSignals);
  allSignals = dedupWithinSource(allSignals);

  const retrievalService = createRetrievalServiceSafe();
  allSignals = await dedupSignalsCrossSource(allSignals, retrievalService);
  allSignals = enrichSignalsGeoForAssess(allSignals);
  // After geo: the event key prefers the resolved canonical locality key, which
  // is the only thing five outlets spelling one town differently will agree on.
  allSignals = collapseNewsEvents(allSignals);

  const { openObservations, summary: openObservationsSummary } = isOmissionAuditEnabled()
    ? { openObservations: [], summary: null }
    : await loadOpenObservationsForAssess({
      targetDate,
      days,
    });

  return {
    loadedFiles,
    allSignals,
    totalArticles,
    sourceFiles,
    sourceTypesSeen,
    hygieneDrops,
    retrievalService,
    pipelineConfig,
    contentKind: contentKindFromSourceTypes(sourceTypesSeen),
    openObservations,
    openObservationsSummary,
  };
}
