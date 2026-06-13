/**
 * Pure ingest preflight for the 3-day (or N-day) resilience pipeline.
 * Mirrors /8comp-3 and /8comp-3-north reuse rules.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTargetDates, loadPipelineConfig } from './assessSignalsHelpers.js';
import { isOpenExtractParallelEnabled } from '../domain/services/openExtractConfig.js';
import {
  fieldReportsGlobDir,
  fieldSignalsPath,
  newsArticlesPath,
  newsSignalsPath,
  pboSignalsPath,
  pipelineOpenObservationsPath,
  radioSignalsPath,
  regionalPboDataDir,
  resolveRepoRoot,
  socialSignalsPath,
  whatsappReportPath,
  whatsappSignalsPath,
} from '../domain/services/pipelineArtifactPaths.js';
import { openPipelineObsNeedsExtract } from './pipelineOpenObsGuard.js';

/** @typedef {'reuse'|'skip'|'fetch_news'|'extract_news'|'extract_radio'|'export_whatsapp'|'extract_whatsapp'|'extract_field'|'extract_open_only'|'extract_open_social'|'extract_pbo_date'|'extract_naftali'|'extract_regional_pbo'|'social_gather'|'pbo_review'} PipelineAction */

/**
 * @param {string} input dd:mm:yyyy or YYYY-MM-DD
 * @returns {string|null} YYYY-MM-DD
 */
export function parsePipelineDateArg(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const colon = /^(\d{2}):(\d{2}):(\d{4})$/.exec(raw);
  if (colon) {
    const [, dd, mm, yyyy] = colon;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function fileNonEmpty(path) {
  try {
    return existsSync(path) && statSync(path).size > 0;
  } catch {
    return false;
  }
}

function listRadioTranscriptsForDate(date, rootDir) {
  const root = resolveRepoRoot(rootDir);
  let names;
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  const suffix = `-${date}T`;
  return names
    .filter((f) => f.startsWith('articles-audio-') && f.includes(suffix) && f.endsWith('.md'))
    .map((f) => resolve(root, f));
}

function listRegionalPboMarkdownForDate(date, rootDir) {
  const dir = regionalPboDataDir(rootDir);
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((f) => f.includes(date) && (f.endsWith('.md') || f.endsWith('.markdown')))
    .map((f) => resolve(dir, f));
}

function listRecentFieldReportMds(rootDir, limit = 3) {
  const dir = fieldReportsGlobDir(rootDir);
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((f) => f.startsWith('articles-field-reports-') && f.endsWith('.md'))
    .sort()
    .slice(-limit)
    .map((f) => resolve(dir, f));
}

function fieldDateFromFilename(filePath) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(filePath);
  return m?.[1] ?? null;
}

function isEnabled(enabledSources, key) {
  if (!enabledSources) return true;
  return enabledSources.has(key);
}

/**
 * @param {Array<{ stage: string, date?: string, action: PipelineAction, detail?: string }>} steps
 * @param {object} opts
 * @param {string} opts.stage
 * @param {string} opts.date
 * @param {string} opts.sourceType
 * @param {string[]} opts.mdPaths absolute paths with readable MD/units
 * @param {string} [opts.rootDir]
 * @param {boolean} [opts.force]
 */
function maybePushOpenBackfillStep(steps, opts) {
  const { stage, date, sourceType, mdPaths, rootDir, force = false } = opts;
  if (force || !isOpenExtractParallelEnabled()) return;
  const readablePaths = (mdPaths ?? []).filter((p) => fileNonEmpty(p));
  if (readablePaths.length === 0) return;

  const openPath = pipelineOpenObservationsPath(sourceType, date, rootDir);
  if (!openPipelineObsNeedsExtract(openPath)) return;

  steps.push({
    stage,
    date,
    action: 'extract_open_only',
    detail: readablePaths.join(','),
  });
}

/**
 * @param {Array<{ stage: string, date?: string, action: PipelineAction, detail?: string }>} steps
 * @param {string} date
 * @param {string} [rootDir]
 * @param {boolean} [force]
 */
function maybePushOpenSocialBackfillStep(steps, date, rootDir, force = false) {
  if (force || !isOpenExtractParallelEnabled()) return;
  if (!fileNonEmpty(socialSignalsPath(date, rootDir))) return;

  const openPath = pipelineOpenObservationsPath('social', date, rootDir);
  if (!openPipelineObsNeedsExtract(openPath)) return;

  steps.push({ stage: 'social', date, action: 'extract_open_social' });
}

/**
 * @param {object} opts
 * @param {string} opts.targetDate YYYY-MM-DD
 * @param {number} [opts.days]
 * @param {Set<string>|null} [opts.enabledSources]
 * @param {boolean} [opts.replayMode]
 * @param {boolean} [opts.conservativeNewsFetch] 8comp-3-north style
 * @param {boolean} [opts.force]
 * @param {string} [opts.rootDir]
 * @returns {{ windowDates: string[], steps: Array<{ stage: string, date?: string, action: PipelineAction, detail?: string }> }}
 */
function pushNewsStepsForDate(steps, date, { sig, md, force, conservativeNewsFetch, replayMode, rootDir }) {
  if (fileNonEmpty(sig) && !force) {
    steps.push({ stage: 'news', date, action: 'reuse' });
    maybePushOpenBackfillStep(steps, {
      stage: 'news',
      date,
      sourceType: 'news',
      mdPaths: [md],
      rootDir,
      force,
    });
    return;
  }
  const shouldFetch = conservativeNewsFetch ? !fileNonEmpty(sig) && !fileNonEmpty(md) : !replayMode;
  if (shouldFetch) steps.push({ stage: 'news', date, action: 'fetch_news' });
  if (fileNonEmpty(md) || shouldFetch) {
    steps.push({ stage: 'news', date, action: 'extract_news' });
  } else {
    steps.push({ stage: 'news', date, action: 'skip', detail: 'no articles file' });
  }
}

function pushRadioStepsForDate(steps, date, { sig, transcripts, force, rootDir }) {
  if (fileNonEmpty(sig) && !force) {
    steps.push({ stage: 'radio', date, action: 'reuse' });
    maybePushOpenBackfillStep(steps, {
      stage: 'radio',
      date,
      sourceType: 'radio',
      mdPaths: transcripts,
      rootDir,
      force,
    });
  } else if (transcripts.length > 0) {
    steps.push({ stage: 'radio', date, action: 'extract_radio', detail: transcripts.join(',') });
  } else {
    steps.push({ stage: 'radio', date, action: 'skip', detail: 'no transcripts' });
  }
}

function pushWhatsappStepsForDate(steps, date, { sig, md, force, rootDir }) {
  if (fileNonEmpty(sig) && !force) {
    steps.push({ stage: 'whatsapp', date, action: 'reuse' });
    maybePushOpenBackfillStep(steps, {
      stage: 'whatsapp',
      date,
      sourceType: 'whatsapp',
      mdPaths: [md],
      rootDir,
      force,
    });
    return;
  }
  if (!fileNonEmpty(md)) steps.push({ stage: 'whatsapp', date, action: 'export_whatsapp' });
  steps.push({ stage: 'whatsapp', date, action: 'extract_whatsapp' });
}

/**
 * @param {Array<{ stage: string, date?: string, action: PipelineAction, detail?: string }>} steps
 * @param {string[]} windowDates
 * @param {{ enabledSources: Set<string>|null, force?: boolean, rootDir?: string }} opts
 */
function pushPboStepsForWindowDates(steps, windowDates, { enabledSources, force = false, rootDir }) {
  if (!isEnabled(enabledSources, 'pbo')) return;

  for (const date of windowDates) {
    const closedPath = pboSignalsPath(date, rootDir);
    const closedOk = fileNonEmpty(closedPath);
    const openNeeds = openPipelineObsNeedsExtract(pipelineOpenObservationsPath('pbo', date, rootDir));
    const parallel = isOpenExtractParallelEnabled();

    if (force || !closedOk || (parallel && openNeeds)) {
      steps.push({ stage: 'pbo', date, action: 'extract_pbo_date' });
    } else {
      steps.push({ stage: 'pbo', date, action: 'reuse' });
    }
  }
}

function pushFieldStepsIfEnabled(steps, enabledSources, replayMode, rootDir, force) {
  if (!isEnabled(enabledSources, 'field')) return;

  for (const file of listRecentFieldReportMds(rootDir)) {
    const date = fieldDateFromFilename(file);
    if (!date) continue;

    if (replayMode) {
      const sig = fieldSignalsPath(date, rootDir);
      if (fileNonEmpty(sig) && !force) {
        steps.push({ stage: 'field', date, action: 'reuse' });
        maybePushOpenBackfillStep(steps, {
          stage: 'field',
          date,
          sourceType: 'field',
          mdPaths: [file],
          rootDir,
          force,
        });
      }
      continue;
    }

    steps.push({ stage: 'field', date, action: 'extract_field', detail: file });
  }
}

function pushOnceSteps(steps, enabledSources, windowDates, { replayMode, targetDate, rootDir, force }) {
  pushFieldStepsIfEnabled(steps, enabledSources, replayMode, rootDir, force);
  pushPboStepsForWindowDates(steps, windowDates, { enabledSources, force, rootDir });
  if (isEnabled(enabledSources, 'naftali') && !replayMode) steps.push({ stage: 'naftali', action: 'extract_naftali' });
  if (!replayMode) steps.push({ stage: 'pbo_review', action: 'pbo_review', date: targetDate });
  for (const date of windowDates) {
    const regional = listRegionalPboMarkdownForDate(date, rootDir);
    if (regional.length > 0) {
      steps.push({ stage: 'regional_pbo', date, action: 'extract_regional_pbo', detail: regional.join(',') });
    }
  }
}

function pushSocialReplaySteps(steps, windowDates, { force, rootDir }) {
  const missing = windowDates.filter((d) => !fileNonEmpty(socialSignalsPath(d, rootDir)));
  for (const d of windowDates) {
    if (fileNonEmpty(socialSignalsPath(d, rootDir)) && !force) {
      steps.push({ stage: 'social', date: d, action: 'reuse' });
      maybePushOpenSocialBackfillStep(steps, d, rootDir, force);
    } else if (missing.includes(d)) {
      steps.push({ stage: 'social', date: d, action: 'skip', detail: 'no social bundle on disk (historical replay cannot re-fetch X/Telegram)' });
    }
  }
}

function pushSocialSteps(steps, windowDates, { replayMode, force, targetDate, rootDir }) {
  if (replayMode) {
    pushSocialReplaySteps(steps, windowDates, { force, rootDir });
    return;
  }
  const missing = windowDates.filter((d) => !fileNonEmpty(socialSignalsPath(d, rootDir)));
  if (missing.length > 0 || force) {
    steps.push({ stage: 'social', action: 'social_gather', date: targetDate });
  } else {
    for (const d of windowDates) {
      steps.push({ stage: 'social', date: d, action: 'reuse' });
      maybePushOpenSocialBackfillStep(steps, d, rootDir, force);
    }
  }
}

export function buildPipelineIngestPlan(opts) {
  const {
    targetDate,
    days = 3,
    enabledSources = null,
    replayMode = false,
    conservativeNewsFetch = false,
    force = false,
    rootDir,
  } = opts;

  const windowDates = [...buildTargetDates(targetDate, days)].sort();
  const steps = [];

  for (const date of windowDates) {
    if (isEnabled(enabledSources, 'news')) {
      pushNewsStepsForDate(steps, date, {
        sig: newsSignalsPath(date, rootDir),
        md: newsArticlesPath(date, rootDir),
        force,
        conservativeNewsFetch,
        replayMode,
        rootDir,
      });
    }
    if (isEnabled(enabledSources, 'radio')) {
      pushRadioStepsForDate(steps, date, {
        sig: radioSignalsPath(date, rootDir),
        transcripts: listRadioTranscriptsForDate(date, rootDir),
        force,
        rootDir,
      });
    }
    if (isEnabled(enabledSources, 'whatsapp')) {
      pushWhatsappStepsForDate(steps, date, {
        sig: whatsappSignalsPath(date, rootDir),
        md: whatsappReportPath(date, rootDir),
        force,
        rootDir,
      });
    }
  }

  pushOnceSteps(steps, enabledSources, windowDates, { replayMode, targetDate, rootDir, force });
  if (isEnabled(enabledSources, 'social')) {
    pushSocialSteps(steps, windowDates, { replayMode, force, targetDate, rootDir });
  }

  return { windowDates, steps };
}

/**
 * @param {string} configPath absolute path to pipeline-config.json
 */
export function loadPipelineEnabledSources(configPath) {
  const { enabledSources } = loadPipelineConfig(configPath);
  return enabledSources;
}

/**
 * Replay abort when nothing can be ingested and no bundles exist in window.
 * @param {ReturnType<typeof buildPipelineIngestPlan>['steps']} steps
 */
export function planHasWork(steps) {
  const actionable = new Set([
    'fetch_news',
    'extract_news',
    'extract_radio',
    'export_whatsapp',
    'extract_whatsapp',
    'extract_field',
    'extract_open_only',
    'extract_open_social',
    'extract_pbo_date',
    'extract_naftali',
    'extract_regional_pbo',
    'social_gather',
    'pbo_review',
  ]);
  if (steps.some((s) => actionable.has(s.action))) return true;
  return steps.some((s) => s.action === 'reuse');
}
