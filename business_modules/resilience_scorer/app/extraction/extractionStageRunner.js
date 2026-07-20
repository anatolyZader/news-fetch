/**
 * STAGE 1 — extraction stage orchestrator.
 *
 * Pipeline position: between extractSignalsCli and the closed/open extract
 * services. Always runs closed-catalogue extraction as the primary path.
 * When isOpenExtractParallelEnabled(), also runs open-vocabulary extraction
 * concurrently (side artifact only; only the closed result is returned).
 *
 * Owns: Promise.all wiring of closed + open; optional closedExtractFn override
 * (pbo muni/regional inputs that need module-specific geo stamping);
 * story-cluster indexing helper.
 *
 * Does NOT: implement LLM calls or write artifacts itself — delegates to
 * closedCatalogueExtractService / openVocabularyExtractService.
 *
 * Key collaborators: openExtractConfig.js, closedCatalogueExtractService.js,
 * openVocabularyExtractService.js.
 */
import { isOpenExtractParallelEnabled } from '../../domain/services/oov/openExtractConfig.js';
import { runClosedCatalogueExtract } from './closedCatalogueExtractService.js';
import { runOpenVocabularyExtract } from './openVocabularyExtractService.js';

/**
 * Run Stage-1 extraction for one source batch.
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
 *   Always the closed-catalogue result (open observations are a side write).
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

/**
 * Best-effort upsert of extracted evidence spans into the story-cluster index.
 * Non-fatal on failure.
 * @param {object|null|undefined} retrievalService
 * @param {Array<object>} signals
 * @returns {Promise<void>}
 */
export async function indexExtractStoryClusters(retrievalService, signals) {
  if (!retrievalService?.storyClusterIndex) return;
  try {
    const { indexed } = await retrievalService.storyClusterIndex.upsertSignals(signals);
    if (indexed > 0) console.error(`  → Story cluster index: ${indexed} evidence span(s)`);
  } catch (err) {
    console.error(`  ⚠ Story cluster index skipped: ${err.message}`);
  }
}
