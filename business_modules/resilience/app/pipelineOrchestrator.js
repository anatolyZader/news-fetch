/**
 * Node orchestrator for the multi-source resilience pipeline (/8comp-3, /8comp-3-north, cron).
 */
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { getTodayInTimezone, validateDate } from '../../../utils/dateUtils.js';
import { normalizeReportScopeId } from '../../../cross-cut-modules/geo/reportScopeIds.js';
import {
  discoverSignalBundles,
  loadAssessSignalFiles,
  loadPipelineConfig,
  mergeLoadedSignalFiles,
} from './assessSignalsHelpers.js';
import { defaultClosedSignalsDir } from '../../signals_extraction/index.js';
import {
  buildPipelineIngestPlan,
  parsePipelineDateArg,
  planHasWork,
} from './pipelineIngestPlan.js';
import {
  newsSignalsPath,
  pipelineOpenObservationsPath,
  radioSignalsPath,
  resolveRepoRoot,
  whatsappSignalsPath,
} from '../domain/services/pipelineArtifactPaths.js';
import {
  readAssessmentReportMeta,
  reportQualityRank,
  resolveReportJsonPathForDate,
} from './reportCacheService.js';
import { writeTokenReport } from '../../../cross-cut-modules/llm/writeTokenReport.js';

const DEFAULT_TZ = process.env.TZ_ARTICLES ?? 'Asia/Jerusalem';

/**
 * Block replay assess-only when a normal report already exists (unless --force).
 * @param {ReturnType<typeof parsePipelineCliArgs>} opts
 * @param {string} rootDir
 */
export function assertAssessOnlySafe(opts, rootDir) {
  if (!opts.assessOnly || opts.force || !opts.replayMode) return;

  const reportsDir = join(rootDir, 'daily_reports');
  const existingPath = resolveReportJsonPathForDate(opts.targetDate, {
    reportsDir,
    scope: opts.scope,
  });
  if (!existingPath) return;

  const meta = readAssessmentReportMeta(existingPath);
  if (reportQualityRank(meta) === 0) {
    throw new Error(
      `Existing normal report for ${opts.targetDate} (${opts.scope}); use full pipeline:run or pass --force`,
    );
  }
}

/**
 * @param {string[]} argv
 */
export function parsePipelineCliArgs(argv) {
  const getFlag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };
  const hasFlag = (name) => argv.includes(name);

  let positionalDate = null;
  for (const arg of argv) {
    if (arg.startsWith('-')) continue;
    positionalDate = parsePipelineDateArg(arg);
    if (positionalDate) break;
  }

  const explicitDate = getFlag('--date');
  const targetDate = parsePipelineDateArg(explicitDate) ?? positionalDate
    ?? getTodayInTimezone(DEFAULT_TZ);

  const days = Math.min(14, Math.max(1, Number.parseInt(getFlag('--days') ?? '3', 10)));
  const scope = normalizeReportScopeId(getFlag('--scope') ?? 'national');
  const force = hasFlag('--force');
  const noTranscribe = hasFlag('--no-transcribe');
  const ingestOnly = hasFlag('--ingest-only');
  const assessOnly = hasFlag('--assess-only');
  const skipSocial = hasFlag('--no-social');

  const today = getTodayInTimezone(DEFAULT_TZ);
  const replayMode = targetDate !== today;
  const conservativeNewsFetch = scope !== 'national' || replayMode;

  return {
    targetDate,
    days,
    scope,
    force,
    noTranscribe,
    ingestOnly,
    assessOnly,
    skipSocial,
    replayMode,
    conservativeNewsFetch,
    today,
  };
}

function runProcess(command, args, { cwd, allowFail = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 || allowFail) resolvePromise(code ?? 0);
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function runNodeScript(scriptRelPath, args, opts) {
  const root = resolveRepoRoot(opts.rootDir);
  return runProcess(process.execPath, [resolve(root, scriptRelPath), ...args], { cwd: root, ...opts });
}

function runNpmScript(scriptName, args, opts) {
  const root = resolveRepoRoot(opts.rootDir);
  return runProcess('npm', ['run', scriptName, '--', ...args], { cwd: root, ...opts });
}

const OPEN_EXTRACT_SOURCE_TYPES = ['news', 'radio', 'whatsapp', 'field', 'social'];

const STAGE_OPEN_EXTRACT_META = {
  news: { sourceType: 'news', contentKind: 'news' },
  radio: { sourceType: 'radio', contentKind: 'audio' },
  whatsapp: { sourceType: 'whatsapp', contentKind: 'whatsapp' },
  field: { sourceType: 'field', contentKind: 'field_report' },
};

function tryUnlink(path) {
  if (!existsSync(path)) return;
  try {
    unlinkSync(path);
    console.error(`  → removed ${path}`);
  } catch (err) {
    console.error(`  ⚠ could not remove ${path}: ${err.message}`);
  }
}

function applyForceDeletes(windowDates, rootDir) {
  for (const date of windowDates) {
    for (const path of [
      newsSignalsPath(date, rootDir),
      radioSignalsPath(date, rootDir),
      whatsappSignalsPath(date, rootDir),
    ]) {
      tryUnlink(path);
    }
    for (const sourceType of OPEN_EXTRACT_SOURCE_TYPES) {
      tryUnlink(pipelineOpenObservationsPath(sourceType, date, rootDir));
    }
  }
}

function printPlan(plan, { replayMode, force, scope, targetDate, days }) {
  console.error('\n═══ Pipeline ingest plan ═══');
  console.error(`  Mode:   ${replayMode ? 'replay' : 'today'}${force ? ' (force)' : ''}`);
  console.error(`  Target: ${targetDate}  days: ${days}  scope: ${scope}`);
  console.error(`  Window: ${plan.windowDates.join(', ')}`);
  for (const step of plan.steps) {
    const datePart = step.date ? ` ${step.date}` : '';
    const detail = step.detail ? ` — ${step.detail}` : '';
    console.error(`  ${step.stage}${datePart}: ${step.action}${detail}`);
  }
  console.error('');
}

async function executeSocialGather(targetDate, days, scope, replayMode, force, rootDir) {
  const args = [
    '--date', targetDate,
    '--days', String(days),
    '--execute',
  ];
  if (scope !== 'national') args.push('--north');
  if (force) args.push('--force');
  if (replayMode) args.push('--replay');
  await runNodeScript('business_modules/social_media/input/socialMediaInput.js', ['gather-daily', ...args], {
    allowFail: true,
    rootDir,
  });
}

async function executeOpenOnlyExtract(step, rootDir) {
  const meta = STAGE_OPEN_EXTRACT_META[step.stage];
  if (!meta || !step.detail || !step.date) {
    console.error(`  ⚠ extract_open_only missing stage meta or files for ${step.stage}`);
    return;
  }

  const { loadMdFiles } = await import('../infrastructure/mdReportsLoader.js');
  const { runOpenOnlyPipelineExtract } = await import('./articleDualPathExtractService.js');
  const { createCostTracker } = await import('../../../cross-cut-modules/budget/index.js');

  const filePaths = step.detail.split(',').map((f) => resolve(rootDir, f.trim()));
  const { articles } = loadMdFiles(filePaths, { dayOffsets: filePaths.map(() => 0) });
  if (!articles.length) {
    console.error(`  ⚠ extract_open_only: no articles loaded from ${filePaths.length} file(s)`);
    return;
  }

  const { onUsage } = createCostTracker({ label: 'extract-open-only' });
  await runOpenOnlyPipelineExtract({
    articles,
    sourceType: meta.sourceType,
    contentKind: meta.contentKind,
    date: step.date,
    filePaths,
    onUsage,
  });
}

async function executeIngestStep(step, ctx) {
  const { rootDir, force } = ctx;
  switch (step.action) {
    case 'reuse':
    case 'skip':
      return;
    case 'fetch_news':
      await runNpmScript('homefront-to-md', [step.date], { allowFail: true, rootDir });
      return;
    case 'extract_news':
      await runNodeScript(
        'business_modules/resilience/input/extract-signals.js',
        ['--source-type', 'news', '--files', `business_modules/news-sites/articles_extracted/articles-homefront-${step.date}.md`, '--date', step.date],
        { allowFail: true, rootDir },
      );
      return;
    case 'extract_radio':
      await runNodeScript(
        'business_modules/resilience/input/extract-signals.js',
        ['--source-type', 'radio', '--files', step.detail, '--date', step.date],
        { allowFail: true, rootDir },
      );
      return;
    case 'export_whatsapp':
      await runNodeScript(
        'business_modules/whatsapp/input/whatsapp-to-md.js',
        ['--date', step.date],
        { allowFail: true, rootDir },
      );
      return;
    case 'extract_whatsapp':
      await runNodeScript(
        'business_modules/resilience/input/extract-signals.js',
        ['--source-type', 'whatsapp', '--files', `business_modules/whatsapp/reports/whatsapp_reports-${step.date}.md`, '--date', step.date],
        { allowFail: true, rootDir },
      );
      return;
    case 'extract_field':
      await runNodeScript(
        'business_modules/resilience/input/extract-signals.js',
        ['--source-type', 'field', '--files', step.detail, '--date', step.date],
        { allowFail: true, rootDir },
      );
      return;
    case 'extract_open_only':
      await executeOpenOnlyExtract(step, rootDir);
      return;
    case 'extract_open_social':
      await runNodeScript(
        'business_modules/social_media/input/backfill-open-observations.js',
        ['--date', step.date],
        { allowFail: true, rootDir },
      );
      return;
    case 'extract_pbo':
      await runNodeScript('business_modules/pbo_report_muni/input/extract-pbo-signals.js', [], { allowFail: true, rootDir });
      return;
    case 'extract_naftali':
      await runNodeScript('business_modules/pool/input/extract-naftali-signals.js', [], { allowFail: true, rootDir });
      return;
    case 'extract_regional_pbo':
      await runNodeScript(
        'business_modules/pbo_report_regional/input/extract-regional-pbo-signals.js',
        ['--files', step.detail, '--date', step.date],
        { allowFail: true, rootDir },
      );
      return;
    case 'pbo_review':
      await runNodeScript(
        'business_modules/pbo_report_review/input/runMunicipalPboReview.js',
        ['--date', step.date],
        { allowFail: true, rootDir },
      );
      return;
    case 'social_gather':
      await executeSocialGather(step.date ?? ctx.targetDate, ctx.days, ctx.scope, ctx.replayMode, force, rootDir);
      return;
    default:
      console.error(`  ⚠ unknown ingest action: ${step.action}`);
  }
}

function countLoadedBundles(targetDate, days, enabledSources, rootDir) {
  const signalsDir = defaultClosedSignalsDir({
    dataDir: resolve(resolveRepoRoot(rootDir), 'business_modules/signals_extraction/data'),
  });
  const fieldSignalsDir = resolve(resolveRepoRoot(rootDir), 'business_modules/visits/data/signals');
  const socialSignalsDir = resolve(resolveRepoRoot(rootDir), 'business_modules/social_media/data');
  const discovery = discoverSignalBundles({
    targetDate,
    days,
    signalsDir,
    fieldSignalsDir,
    socialSignalsDir,
    enabledSources,
  });
  const loaded = loadAssessSignalFiles({
    ...discovery,
    targetDate,
    targetDates: discovery.targetDates,
    recencySources: discovery.recencySources,
    enabledSources,
  });
  const merged = mergeLoadedSignalFiles(loaded);
  return { loaded, merged, discovery };
}

/**
 * @param {ReturnType<typeof parsePipelineCliArgs>} opts
 * @param {{ rootDir?: string }} [deps]
 */
export async function runPipelineOrchestrator(opts, deps = {}) {
  const startedAt = new Date().toISOString();
  const rootDir = deps.rootDir ?? resolveRepoRoot();
  const validation = validateDate(opts.targetDate, DEFAULT_TZ);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid date');
  }

  assertAssessOnlySafe(opts, rootDir);

  const configPath = resolve(rootDir, 'pipeline-config.json');
  const { enabledSources: configSources } = loadPipelineConfig(configPath);
  let enabledSources = configSources;
  if (opts.skipSocial && enabledSources) {
    enabledSources = new Set([...enabledSources].filter((s) => s !== 'social'));
  }

  const plan = buildPipelineIngestPlan({
    targetDate: opts.targetDate,
    days: opts.days,
    enabledSources,
    replayMode: opts.replayMode,
    conservativeNewsFetch: opts.conservativeNewsFetch,
    force: opts.force,
    rootDir,
  });

  printPlan(plan, opts);

  if (opts.replayMode && !planHasWork(plan.steps)) {
    throw new Error(`no signals or source data exist for ${opts.targetDate} or the prior ${opts.days - 1} day(s)`);
  }

  if (!opts.assessOnly) {
    await runIngestPhase(plan, opts, rootDir, enabledSources);
  }

  if (opts.ingestOnly) {
    tryWriteTokenReport(startedAt, opts, rootDir);
    console.error('\n═══ Ingest complete (assess skipped) ═══');
    return { plan, assessed: false };
  }

  const { loaded, merged } = countLoadedBundles(opts.targetDate, opts.days, enabledSources, rootDir);
  console.error(`\n── Assess: ${loaded.length} bundle(s), ${merged.allSignals.length} signal(s) ──`);
  if (loaded.length === 0) {
    throw new Error(`No signal files found for ${opts.targetDate} (+${opts.days - 1} day window)`);
  }

  await runNodeScript(
    'business_modules/resilience/input/assess-signals.js',
    ['--date', opts.targetDate, '--days', String(opts.days), '--scope', opts.scope],
    { rootDir },
  );

  tryWriteTokenReport(startedAt, opts, rootDir);
  console.error('\n═══ Pipeline complete ═══');
  return { plan, assessed: true, signalCount: merged.allSignals.length };
}

async function runIngestPhase(plan, opts, rootDir, enabledSources) {
  if (opts.force) applyForceDeletes(plan.windowDates, rootDir);

  if (!opts.noTranscribe && !opts.replayMode && isSourceEnabled(enabledSources, 'radio')) {
    console.error('── Transcribe missing radio recordings ──');
    await runProcess('bash', [resolve(rootDir, 'scripts/radio-transcribe.sh'), String(opts.days)], {
      cwd: rootDir,
      allowFail: true,
    });
  }

  const executed = new Set();
  for (const step of plan.steps) {
    const key = `${step.stage}:${step.date ?? ''}:${step.action}`;
    if (executed.has(key)) continue;
    executed.add(key);
    if (step.action === 'reuse' || step.action === 'skip') continue;
    const datePart = step.date ? ` (${step.date})` : '';
    console.error(`── ${step.stage}${datePart}: ${step.action} ──`);
    await executeIngestStep(step, { ...opts, rootDir });
  }
}

function tryWriteTokenReport(startedAt, opts, rootDir) {
  const completedAt = new Date().toISOString();
  const reportsDir = join(rootDir, 'cross-cut-modules/budget/resilience_analysis');
  try {
    const reportPath = writeTokenReport({ startedAt, completedAt, date: opts.targetDate, scope: opts.scope, days: opts.days, reportsDir, rootDir });
    console.error(`\n  → Token report: ${reportPath}`);
  } catch (err) {
    console.error(`  ⚠ Could not write token report: ${err.message}`);
  }
}

function isSourceEnabled(enabledSources, key) {
  if (!enabledSources) return true;
  return enabledSources.has(key);
}
