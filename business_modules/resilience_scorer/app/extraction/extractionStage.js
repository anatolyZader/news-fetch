/**
 * STAGE 1 — extraction stage orchestrator.
 * Runs closed-catalogue extraction as the primary path.
 * When isOpenExtractParallelEnabled(), also runs open-vocabulary extraction concurrently
 * (fire-and-forget side artifact; only the closed result is returned).
 *
 * Callers may supply closedExtractFn to override the default closed-catalogue extractor
 * (used by pbo_report muni/regional inputs which need module-specific geo stamping).
 */
import { isOpenExtractParallelEnabled } from '../../domain/services/oov/openExtractConfig.js';
import { runClosedCatalogueExtract } from './closedCatalogueExtractService.js';
import { runOpenVocabularyExtract } from './openVocabularyExtractService.js';

/**
 * @param {{
 *   repoRoot: string,
 *   articles: Array<object>,
 *   sourceType: string,
 *   contentKind: string,
 *   date: string,
 *   filePaths: string[],
 *   onUsage: Function,
 *   retrievalService?: object|null,
 *   closedExtractFn?: Function,
 *   trace?: object|null,
 * }} opts
 * @returns {Promise<{ signals: Array<object>, bundleDistrictId: string|null }>}
 */
export async function runExtractionStage(opts) {
  const {
    repoRoot,
    articles,
    sourceType,
    contentKind,
    date,
    filePaths,
    onUsage,
    retrievalService = null,
    closedExtractFn,
    trace = null,
  } = opts;

  const runClosed = () => {
    if (typeof closedExtractFn === 'function') {
      return closedExtractFn({
        articles,
        sourceType,
        contentKind,
        date,
        filePaths,
        onUsage,
        retrievalService,
        repoRoot,
      });
    }
    return runClosedCatalogueExtract({
      repoRoot,
      articles,
      sourceType,
      contentKind,
      date,
      filePaths,
      onUsage,
      retrievalService,
      trace,
    });
  };

  if (!isOpenExtractParallelEnabled()) {
    return runClosed();
  }

  const [closedResult] = await Promise.all([
    runClosed(),
    runOpenVocabularyExtract({
      articles,
      sourceType,
      contentKind,
      date,
      filePaths,
      onUsage,
    }),
  ]);
  return closedResult;
}

export async function indexExtractStoryClusters(retrievalService, signals) {
  if (!retrievalService?.storyClusterIndex) return;
  try {
    const { indexed } = await retrievalService.storyClusterIndex.upsertSignals(signals);
    if (indexed > 0) console.error(`  → Story cluster index: ${indexed} evidence span(s)`);
  } catch (err) {
    console.error(`  ⚠ Story cluster index skipped: ${err.message}`);
  }
}
