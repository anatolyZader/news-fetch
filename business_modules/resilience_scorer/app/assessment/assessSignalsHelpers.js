/**
 * Assess-signals helper seam. The implementation now lives in focused modules —
 * this file keeps the CLI arg parser and re-exports every previously-public
 * name so existing callers and tests keep working:
 *
 *   - domain/services/paths/assessmentWindow.js — window/date math + bundle filename parsing
 *   - domain/services/paths/signalBundles.js — bundle discovery/loading/merging (fs)
 *   - ./signalDedup.js — within-source / cross-source / semantic dedup
 *   - ./scoreEnrichment.js — delta channel + epistemic score enrichment
 */

import { getArg as getArgFrom } from '../cliArgs.js';
import { normalizeReportScope, reportScopeMetadata } from '../../domain/services/signals/regionSignalFilter.js';
import { MAX_ASSESSMENT_DAYS } from '../../domain/services/paths/assessmentWindow.js';

export {
  MAX_ASSESSMENT_DAYS,
  INVALID_SIGNAL_BUNDLE_DATES,
  parseSignalBundleFilename,
  temporalWeightForOffset,
  buildTargetDates,
  dateOffset,
  buildAssessmentWindowMetadata,
  inferAssessmentWindowFromSourceFiles,
  signalBundlesInAssessmentWindow,
} from '../../domain/services/paths/assessmentWindow.js';

export {
  discoverSignalBundles,
  loadPipelineConfig,
  loadAssessSignalFiles,
  mergeLoadedSignalFiles,
} from '../../domain/services/paths/signalBundles.js';

export {
  dedupWithinSource,
  crossSourceDedup,
  crossSourceDedupClustered,
  crossSourceDedupSemantic,
} from './signalDedup.js';

export {
  blendWithYesterday,
  deltaSignificance,
  isEwmaFreezeOnEpistemicEnabled,
  enrichWithDeltaChannel,
  enrichScoredComponentsEpistemic,
} from './scoreEnrichment.js';

/**
 * @param {string[]} argv CLI args without node/script (e.g. process.argv.slice(2))
 */
export function parseAssessCliArgs(argv) {
  const args = argv;
  const getArg = (flag) => getArgFrom(args, flag);

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
