/**
 * Pure ingest preflight for the N-day resilience pipeline.
 * Policy-driven: refresh | reuse-first | always-reextract (see pipelineIngestPolicy.js).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTargetDates } from '../assessment/assessSignalsHelpers.js';
import {
  isOpenExtractParallelEnabled,
  isOpenPipelineLegacyEnabled,
} from '../../domain/services/oov/openExtractConfig.js';
import { shouldReuseInReplay } from '../../domain/services/pipeline/replayReuseConfig.js';
import {
  resolveIngestPolicy,
  shouldReuseBundle,
  wantsAlwaysReextractPbo,
} from '../../domain/services/pipeline/pipelineIngestPolicy.js';
import { normalizePipelineSourceKey } from '../../domain/services/signals/visitsSourceType.js';
import { isBundleFreshForRun } from '../../../social_media/index.js';
import {
  visitsReportsGlobDir,
  visitsSignalsPath,
  newsArticlesPath,
  newsSignalsPath,
  pboRegionalSignalsPath,
  pboSignalsPath,
  pipelineOpenObservationsPath,
  radioSignalsPath,
  regionalPboDataDir,
  socialSignalsPath,
  whatsappReportPath,
  whatsappSignalsPath,
} from '../../domain/services/paths/ingestPaths.js';
import { resolveRepoRoot } from '../../domain/services/paths/repoRoot.js';
import { openPipelineObsNeedsExtract } from './pipelineOpenObsGuard.js';

export const PIPELINE_ACTIONS = Object.freeze([
  'reuse',
  'skip',
  'fetch_news',
  'extract_news',
  'extract_radio',
  'export_whatsapp',
  'extract_whatsapp',
  'extract_visits',
  'extract_open_only',
  'extract_open_social',
  'extract_pbo_date',
  'extract_naftali',
  'extract_regional_pbo',
  'social_gather',
  'pbo_review',
]);

/** @typedef {typeof PIPELINE_ACTIONS[number]} PipelineAction */

/**
 * @param {string} input dd:mm:yyyy, dd/mm/yyyy, or YYYY-MM-DD
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
  const slash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (slash) {
    const [, dd, mm, yyyy] = slash;
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

function readSocialBundle(date, rootDir) {
  const path = socialSignalsPath(date, rootDir);
  if (!fileNonEmpty(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function socialBundleUsable(date, rootDir, runDate, force) {
  if (force) return false;
  const bundle = readSocialBundle(date, rootDir);
  if (!bundle) return false;
  return isBundleFreshForRun(bundle, runDate);
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

/**
 * @param {string} rootDir
 * @param {{ limit?: number|null }} [opts] null limit = all MDs
 */
function listVisitReportMds(rootDir, { limit = 3 } = {}) {
  const dir = visitsReportsGlobDir(rootDir);
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const sorted = names
    .filter((f) => f.startsWith('articles-field-reports-') && f.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b));
  const picked = limit == null ? sorted : sorted.slice(-limit);
  return picked.map((f) => resolve(dir, f));
}

function visitDateFromFilename(filePath) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(filePath);
  return m?.[1] ?? null;
}

function isEnabled(enabledSources, key) {
  if (!enabledSources) return true;
  const canonical = normalizePipelineSourceKey(key);
  if (enabledSources.has(canonical) || enabledSources.has(key)) return true;
  if (canonical === 'visits' && enabledSources.has('field')) return true;
  return false;
}

function skipOpenBackfill({ replayMode, sourceType, force, env, ingestPolicy }) {
  if (force || ingestPolicy === 'always-reextract') return true;
  if (replayMode && !shouldReuseInReplay(sourceType, { replayMode, force, env })) return true;
  return false;
}

/**
 * @param {Array<{ stage: string, date?: string, action: PipelineAction, detail?: string }>} steps
 * @param {object} opts
 */
function maybePushOpenBackfillStep(steps, opts) {
  const {
    stage, date, sourceType, mdPaths, rootDir, force = false, replayMode = false, env, ingestPolicy,
  } = opts;
  if (skipOpenBackfill({ replayMode, sourceType, force, env, ingestPolicy })
    || !isOpenExtractParallelEnabled(env)
    || !isOpenPipelineLegacyEnabled(env)) {
    return;
  }
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

function maybePushOpenSocialBackfillStep(steps, date, ctx) {
  const { force = false, replayMode = false, rootDir, env, ingestPolicy } = ctx;
  if (skipOpenBackfill({ replayMode, sourceType: 'social', force, env, ingestPolicy })
    || !isOpenExtractParallelEnabled(env)
    || !isOpenPipelineLegacyEnabled(env)) {
    return;
  }
  if (!fileNonEmpty(socialSignalsPath(date, rootDir))) return;

  const openPath = pipelineOpenObservationsPath('social', date, rootDir);
  if (!openPipelineObsNeedsExtract(openPath)) return;

  steps.push({ stage: 'social', date, action: 'extract_open_social' });
}

function pushNewsStepsForDate(steps, date, ctx) {
  const {
    sig, md, force, conservativeNewsFetch, replayMode, rootDir, env, ingestPolicy,
  } = ctx;

  if (shouldReuseBundle({
    ingestPolicy, replayMode, sourceType: 'news', force, bundleExists: fileNonEmpty(sig), env,
  })) {
    steps.push({ stage: 'news', date, action: 'reuse' });
    maybePushOpenBackfillStep(steps, {
      stage: 'news',
      date,
      sourceType: 'news',
      mdPaths: [md],
      rootDir,
      force,
      replayMode,
      env,
      ingestPolicy,
    });
    return;
  }

  const refetchExistingMd = force && fileNonEmpty(md) && ingestPolicy === 'always-reextract';
  const shouldFetch = refetchExistingMd
    || (conservativeNewsFetch ? !fileNonEmpty(sig) && !fileNonEmpty(md) : !replayMode);
  if (shouldFetch) steps.push({ stage: 'news', date, action: 'fetch_news' });
  if (fileNonEmpty(md) || shouldFetch) {
    steps.push({ stage: 'news', date, action: 'extract_news' });
  } else {
    steps.push({ stage: 'news', date, action: 'skip', detail: 'no articles file' });
  }
}

function pushRadioStepsForDate(steps, date, ctx) {
  const { sig, transcripts, force, replayMode, rootDir, env, ingestPolicy } = ctx;

  if (shouldReuseBundle({
    ingestPolicy, replayMode, sourceType: 'radio', force, bundleExists: fileNonEmpty(sig), env,
  })) {
    steps.push({ stage: 'radio', date, action: 'reuse' });
    maybePushOpenBackfillStep(steps, {
      stage: 'radio',
      date,
      sourceType: 'radio',
      mdPaths: transcripts,
      rootDir,
      force,
      replayMode,
      env,
      ingestPolicy,
    });
  } else if (transcripts.length > 0) {
    steps.push({ stage: 'radio', date, action: 'extract_radio', detail: transcripts.join(',') });
  } else {
    steps.push({ stage: 'radio', date, action: 'skip', detail: 'no transcripts' });
  }
}

function pushWhatsappStepsForDate(steps, date, ctx) {
  const { sig, md, force, replayMode, rootDir, env, ingestPolicy } = ctx;

  if (shouldReuseBundle({
    ingestPolicy, replayMode, sourceType: 'whatsapp', force, bundleExists: fileNonEmpty(sig), env,
  })) {
    steps.push({ stage: 'whatsapp', date, action: 'reuse' });
    maybePushOpenBackfillStep(steps, {
      stage: 'whatsapp',
      date,
      sourceType: 'whatsapp',
      mdPaths: [md],
      rootDir,
      force,
      replayMode,
      env,
      ingestPolicy,
    });
    return;
  }
  if (!fileNonEmpty(md)) steps.push({ stage: 'whatsapp', date, action: 'export_whatsapp' });
  steps.push({ stage: 'whatsapp', date, action: 'extract_whatsapp' });
}

function pushPboStepsForWindowDates(steps, windowDates, ctx) {
  const { enabledSources, force = false, rootDir, replayMode, env, ingestPolicy } = ctx;
  if (!isEnabled(enabledSources, 'pbo')) return;

  const parallel = isOpenExtractParallelEnabled();

  for (const date of windowDates) {
    const closedPath = pboSignalsPath(date, rootDir);
    const closedOk = fileNonEmpty(closedPath);
    const openNeeds = openPipelineObsNeedsExtract(pipelineOpenObservationsPath('pbo', date, rootDir));

    const wantsExtract = force
      || wantsAlwaysReextractPbo(ingestPolicy)
      || !closedOk
      || (parallel && openNeeds)
      || (replayMode && !shouldReuseInReplay('pbo', { replayMode, force, env }));

    if (wantsExtract) {
      steps.push({ stage: 'pbo', date, action: 'extract_pbo_date' });
    } else {
      steps.push({ stage: 'pbo', date, action: 'reuse' });
    }
  }
}

function pushVisitsStepsIfEnabled(steps, enabledSources, ctx) {
  const { replayMode, rootDir, force, env, ingestPolicy } = ctx;
  if (!isEnabled(enabledSources, 'visits')) return;

  const limit = ingestPolicy === 'always-reextract' ? null : 3;
  for (const file of listVisitReportMds(rootDir, { limit })) {
    const date = visitDateFromFilename(file);
    if (!date) continue;

    const sig = visitsSignalsPath(date, rootDir);
    if (shouldReuseBundle({
      ingestPolicy, replayMode, sourceType: 'visits', force, bundleExists: fileNonEmpty(sig), env,
    })) {
      steps.push({ stage: 'visits', date, action: 'reuse' });
      maybePushOpenBackfillStep(steps, {
        stage: 'visits',
        date,
        sourceType: 'visits',
        mdPaths: [file],
        rootDir,
        force,
        replayMode,
        env,
        ingestPolicy,
      });
      continue;
    }

    steps.push({ stage: 'visits', date, action: 'extract_visits', detail: file });
  }
}

function pushRegionalPboSteps(steps, windowDates, ctx) {
  const { replayMode, force, rootDir, env, ingestPolicy } = ctx;
  const parallel = isOpenExtractParallelEnabled();

  for (const date of windowDates) {
    const regional = listRegionalPboMarkdownForDate(date, rootDir);
    if (regional.length === 0) continue;

    const closedOk = fileNonEmpty(pboRegionalSignalsPath(date, rootDir));
    const openNeeds = openPipelineObsNeedsExtract(pipelineOpenObservationsPath('pbo_regional', date, rootDir));
    const canReuse = !wantsAlwaysReextractPbo(ingestPolicy) && shouldReuseBundle({
      ingestPolicy,
      replayMode,
      sourceType: 'pbo_regional',
      force,
      bundleExists: closedOk && (!parallel || !openNeeds),
      env,
    });

    if (canReuse) {
      steps.push({ stage: 'regional_pbo', date, action: 'reuse' });
      continue;
    }

    steps.push({ stage: 'regional_pbo', date, action: 'extract_regional_pbo', detail: regional.join(',') });
  }
}

function pushOnceSteps(steps, enabledSources, windowDates, ctx) {
  pushVisitsStepsIfEnabled(steps, enabledSources, ctx);
  pushPboStepsForWindowDates(steps, windowDates, { enabledSources, ...ctx });
  const { replayMode, targetDate, force, env, ingestPolicy } = ctx;
  const runNaftali = !replayMode
    || wantsAlwaysReextractPbo(ingestPolicy)
    || !shouldReuseInReplay('naftali', { replayMode, force, env });
  if (isEnabled(enabledSources, 'naftali') && runNaftali) {
    steps.push({ stage: 'naftali', action: 'extract_naftali' });
  }
  if (!replayMode) steps.push({ stage: 'pbo_review', action: 'pbo_review', date: targetDate });
  pushRegionalPboSteps(steps, windowDates, ctx);
}

function pushSocialReplaySteps(steps, windowDates, ctx) {
  const { force, rootDir, replayMode, env, ingestPolicy } = ctx;
  const missing = new Set(windowDates.filter((d) => !fileNonEmpty(socialSignalsPath(d, rootDir))));
  for (const d of windowDates) {
    if (shouldReuseBundle({
      ingestPolicy,
      replayMode,
      sourceType: 'social',
      force,
      bundleExists: fileNonEmpty(socialSignalsPath(d, rootDir)),
      env,
    })) {
      steps.push({ stage: 'social', date: d, action: 'reuse' });
      maybePushOpenSocialBackfillStep(steps, d, { force, replayMode, rootDir, env, ingestPolicy });
    } else if (missing.has(d)) {
      steps.push({
        stage: 'social',
        date: d,
        action: 'skip',
        detail: 'no social bundle on disk (historical replay cannot re-fetch X/Telegram)',
      });
    }
  }
}

function pushSocialSteps(steps, windowDates, ctx) {
  const { replayMode, force, targetDate, rootDir, env, ingestPolicy, today } = ctx;
  if (replayMode) {
    pushSocialReplaySteps(steps, windowDates, ctx);
    return;
  }
  const runDate = today ?? targetDate;
  const staleOrMissing = windowDates.filter(
    (d) => !socialBundleUsable(d, rootDir, runDate, force),
  );
  if (staleOrMissing.length > 0 || force) {
    steps.push({ stage: 'social', action: 'social_gather', date: targetDate });
  } else {
    for (const d of windowDates) {
      steps.push({ stage: 'social', date: d, action: 'reuse' });
      maybePushOpenSocialBackfillStep(steps, d, { force, replayMode, rootDir, env, ingestPolicy });
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
    ingestPolicy: ingestPolicyOpt = null,
    alwaysReextract = false,
    scope = 'national',
    today = null,
    rootDir,
    env = process.env,
  } = opts;

  const ingestPolicy = resolveIngestPolicy({
    ingestPolicy: ingestPolicyOpt,
    alwaysReextract,
    scope,
    replayMode,
  });

  const windowDates = [...buildTargetDates(targetDate, days)].sort((a, b) => a.localeCompare(b));
  const steps = [];
  const sharedCtx = {
    replayMode,
    targetDate,
    rootDir,
    force,
    env,
    ingestPolicy,
    conservativeNewsFetch,
    today,
  };

  for (const date of windowDates) {
    if (isEnabled(enabledSources, 'news')) {
      pushNewsStepsForDate(steps, date, {
        sig: newsSignalsPath(date, rootDir),
        md: newsArticlesPath(date, rootDir),
        ...sharedCtx,
      });
    }
    if (isEnabled(enabledSources, 'radio')) {
      pushRadioStepsForDate(steps, date, {
        sig: radioSignalsPath(date, rootDir),
        transcripts: listRadioTranscriptsForDate(date, rootDir),
        ...sharedCtx,
      });
    }
    if (isEnabled(enabledSources, 'whatsapp')) {
      pushWhatsappStepsForDate(steps, date, {
        sig: whatsappSignalsPath(date, rootDir),
        md: whatsappReportPath(date, rootDir),
        ...sharedCtx,
      });
    }
  }

  pushOnceSteps(steps, enabledSources, windowDates, sharedCtx);
  if (isEnabled(enabledSources, 'social')) {
    pushSocialSteps(steps, windowDates, sharedCtx);
  }

  return { windowDates, steps, ingestPolicy };
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
    'extract_visits',
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
