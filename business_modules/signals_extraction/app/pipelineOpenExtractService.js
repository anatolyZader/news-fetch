/**
 * Central pipeline open-vocabulary extract (profile: pipeline).
 */
import { createDefaultSignalsExtractionService } from './signalsExtractionService.js';
import { isOpenPipelineExtractEnabled } from '../domain/services/openPipelineConfig.js';

/**
 * @param {{
 *   articles: Array<object>,
 *   sourceType: string,
 *   contentKind?: string,
 *   date: string,
 *   sourceFiles?: string[],
 *   onUsage?: Function,
 *   env?: NodeJS.ProcessEnv,
 * }} opts
 */
export async function runPipelineOpenExtract(opts) {
  if (!isOpenPipelineExtractEnabled(opts.env)) return null;
  if (!opts.articles?.length) return null;

  try {
    const openService = createDefaultSignalsExtractionService();
    const result = await openService.extractAndSave(opts.articles, {
      profile: 'pipeline',
      date: opts.date,
      contentKind: opts.contentKind ?? 'mixed',
      sourceType: opts.sourceType,
      sourceFiles: opts.sourceFiles ?? [],
      onUsage: opts.onUsage
        ? (u) => opts.onUsage({ ...u, label: u.label ?? 'open-extract-pipeline' })
        : undefined,
    });
    if (result.observationCount > 0) {
      console.error(`  → Open pipeline observations: ${result.observationCount} → ${result.path}`);
    } else {
      console.error('  → Open pipeline observations: none extracted');
    }
    return result;
  } catch (err) {
    console.error(`  ⚠ Open pipeline extract skipped: ${err.message}`);
    return null;
  }
}
