/**
 * Pure ingest preflight for the 3-day (or N-day) resilience pipeline.
 * Mirrors /8comp-3 and /8comp-3-north reuse rules.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTargetDates, loadPipelineConfig } from './assessSignalsHelpers.js';
import {
  fieldReportsGlobDir,
  newsArticlesPath,
  newsSignalsPath,
  radioSignalsPath,
  regionalPboDataDir,
  resolveRepoRoot,
  socialSignalsPath,
  whatsappReportPath,
  whatsappSignalsPath,
} from '../domain/services/pipelineArtifactPaths.js';

/** @typedef {'reuse'|'skip'|'fetch_news'|'extract_news'|'extract_radio'|'export_whatsapp'|'extract_whatsapp'|'extract_field'|'extract_pbo'|'extract_naftali'|'extract_regional_pbo'|'social_gather'|'pbo_review'} PipelineAction */

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
      const sig = newsSignalsPath(date, rootDir);
      const md = newsArticlesPath(date, rootDir);
      if (fileNonEmpty(sig) && !force) {
        steps.push({ stage: 'news', date, action: 'reuse' });
      } else {
        const shouldFetch = conservativeNewsFetch
          ? !fileNonEmpty(sig) && !fileNonEmpty(md)
          : !replayMode;
        if (shouldFetch) {
          steps.push({ stage: 'news', date, action: 'fetch_news' });
        }
        if (fileNonEmpty(md) || shouldFetch) {
          steps.push({ stage: 'news', date, action: 'extract_news' });
        } else {
          steps.push({ stage: 'news', date, action: 'skip', detail: 'no articles file' });
        }
      }
    }

    if (isEnabled(enabledSources, 'radio')) {
      const sig = radioSignalsPath(date, rootDir);
      const transcripts = listRadioTranscriptsForDate(date, rootDir);
      if (fileNonEmpty(sig) && !force) {
        steps.push({ stage: 'radio', date, action: 'reuse' });
      } else if (transcripts.length > 0) {
        steps.push({
          stage: 'radio',
          date,
          action: 'extract_radio',
          detail: transcripts.join(','),
        });
      } else {
        steps.push({ stage: 'radio', date, action: 'skip', detail: 'no transcripts' });
      }
    }

    if (isEnabled(enabledSources, 'whatsapp')) {
      const sig = whatsappSignalsPath(date, rootDir);
      const md = whatsappReportPath(date, rootDir);
      if (fileNonEmpty(sig) && !force) {
        steps.push({ stage: 'whatsapp', date, action: 'reuse' });
      } else {
        if (!fileNonEmpty(md)) {
          steps.push({ stage: 'whatsapp', date, action: 'export_whatsapp' });
        }
        steps.push({ stage: 'whatsapp', date, action: 'extract_whatsapp' });
      }
    }
  }

  if (isEnabled(enabledSources, 'field') && !replayMode) {
    for (const file of listRecentFieldReportMds(rootDir)) {
      const date = fieldDateFromFilename(file);
      if (!date) continue;
      steps.push({ stage: 'field', date, action: 'extract_field', detail: file });
    }
  }

  if (isEnabled(enabledSources, 'pbo') && !replayMode) {
    steps.push({ stage: 'pbo', action: 'extract_pbo' });
  }

  if (isEnabled(enabledSources, 'naftali') && !replayMode) {
    steps.push({ stage: 'naftali', action: 'extract_naftali' });
  }

  if (!replayMode) {
    steps.push({ stage: 'pbo_review', action: 'pbo_review', date: targetDate });
  }

  for (const date of windowDates) {
    const regional = listRegionalPboMarkdownForDate(date, rootDir);
    if (regional.length > 0) {
      steps.push({
        stage: 'regional_pbo',
        date,
        action: 'extract_regional_pbo',
        detail: regional.join(','),
      });
    }
  }

  if (isEnabled(enabledSources, 'social')) {
    const missing = windowDates.filter((d) => !fileNonEmpty(socialSignalsPath(d, rootDir)));
    if (replayMode) {
      for (const d of windowDates) {
        if (fileNonEmpty(socialSignalsPath(d, rootDir)) && !force) {
          steps.push({ stage: 'social', date: d, action: 'reuse' });
        } else if (missing.includes(d)) {
          steps.push({
            stage: 'social',
            date: d,
            action: 'skip',
            detail: 'no social bundle on disk (historical replay cannot re-fetch X/Telegram)',
          });
        }
      }
    } else if (missing.length > 0 || force) {
      steps.push({ stage: 'social', action: 'social_gather', date: targetDate });
    } else {
      for (const d of windowDates) {
        steps.push({ stage: 'social', date: d, action: 'reuse' });
      }
    }
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
    'extract_pbo',
    'extract_naftali',
    'extract_regional_pbo',
    'social_gather',
    'pbo_review',
  ]);
  if (steps.some((s) => actionable.has(s.action))) return true;
  return steps.some((s) => s.action === 'reuse');
}
