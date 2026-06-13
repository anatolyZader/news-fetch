/**
 * MD/article sources: closed catalogue extract + pipeline open extract in parallel.
 */
import { basename, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { extractSignals } from '../infrastructure/claudeEvaluator.js';
import { enrichSignalsWithGeo } from '../../../cross-cut-modules/geo/enrichSignalsWithGeo.js';
import { attachSourceIdsToSignals } from '../../../db/source_archive/attachSourceIds.js';
import { defaultClosedSignalsDir } from '../../signals_extraction/index.js';

/**
 * Open-vocabulary pipeline extract only (no closed catalogue LLM or signals JSON write).
 * @param {{
 *   articles: Array<object>,
 *   sourceType: string,
 *   contentKind?: string,
 *   date: string,
 *   filePaths?: string[],
 *   onUsage?: Function,
 * }} opts
 */
export async function runOpenOnlyPipelineExtract(opts) {
  const {
    articles,
    sourceType,
    contentKind = 'mixed',
    date,
    filePaths = [],
    onUsage,
  } = opts;

  const { runPipelineOpenExtract } = await import('../../signals_extraction/index.js');
  return runPipelineOpenExtract({
    articles,
    sourceType,
    contentKind,
    date,
    sourceFiles: filePaths,
    onUsage,
  });
}

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
 * }} opts
 */
export async function runArticleDualPathExtract(opts) {
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
  } = opts;

  const runClosed = async () => {
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

    const rawSignals = await extractSignals(articles, {
      onUsage,
      contentKind,
      retrievalService,
      reportDate: date,
    });
    let signals = rawSignals.map((s) => ({ ...s, source_type: sourceType }));
    const { signals: withGeo, attached, resolved, unknown } = enrichSignalsWithGeo(signals, {
      rootDir: repoRoot,
      unknownSourceType: `extract-${sourceType}`,
    });
    signals = withGeo;
    if (attached > 0) {
      console.error(`  → Geo attach: ${attached} signals, ${resolved} resolved, ${unknown} unknown`);
    }
    signals = attachSourceIdsToSignals(signals, filePaths, repoRoot);
    const bundleDistrictId = sourceType === 'field' || sourceType === 'whatsapp' ? 'north' : null;
    if (bundleDistrictId) {
      signals = signals.map((s) => ({ ...s, district_id: bundleDistrictId }));
    }

    const outDir = sourceType === 'field'
      ? resolve('business_modules', 'visits', 'data', 'signals')
      : defaultClosedSignalsDir();
    mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, `signals-${sourceType}-${date}.json`);
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          source_type: sourceType,
          content_kind: contentKind,
          ...(bundleDistrictId ? { district_id: bundleDistrictId } : {}),
          date,
          extracted_at: new Date().toISOString(),
          source_files: filePaths.map((f) => basename(f)),
          total_articles: articles.length,
          signals,
        },
        null,
        2,
      ),
      'utf-8',
    );
    console.error(`\n→ ${signals.length} signals extracted`);
    console.error(`\nSignal file written: ${outPath}`);
    return { signals, bundleDistrictId };
  };

  const [closedResult] = await Promise.all([
    runClosed(),
    runOpenOnlyPipelineExtract({
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
