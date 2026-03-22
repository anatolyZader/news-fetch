/**
 * Analysis service — orchestrates the full resilience analysis pipeline via business_modules/resilience.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, basename, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

import { runResilienceAssessment } from '../business_modules/resilience/app/resilienceAnalysisService.js';
import { contentBatchFromMdArticles } from '../business_modules/resilience/app/contentBatchFromMdArticles.js';
import { createAnthropicResilienceLlmAdapter } from '../business_modules/resilience/infrastructure/adapters/anthropicResilienceLlmAdapter.js';
import { createResilienceReportFsAdapter } from '../business_modules/resilience/infrastructure/adapters/resilienceReportFsAdapter.js';

import { getTodayInTimezone } from '../utils/dateUtils.js';
import { loadMdFiles } from '../business_modules/resilience/infrastructure/mdReportsLoader.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Same default as extractHomefrontArticles — single merged input for resilience. */
function resolveHomefrontMdPath() {
  const raw = (process.env.HOMEFRONT_MD || 'articles-homefront.md').trim();
  return isAbsolute(raw) ? raw : resolve(ROOT, raw);
}

function countUniqueByTitle(articles) {
  const seen = new Set();
  return articles.filter((a) => {
    const key = a.title.replace(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).length;
}

const PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
};

function reportPaths(date) {
  const base = resolve(ROOT, 'reports', `resilience-report-${date}`);
  return { base, json: `${base}.json`, md: `${base}.md` };
}

/**
 * Return today's cached report, or null if none exists.
 */
export function getCachedReport() {
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const date = getTodayInTimezone(timezone);
  const { json } = reportPaths(date);
  if (!existsSync(json)) return null;
  return JSON.parse(readFileSync(json, 'utf-8'));
}

/**
 * Run full analysis pipeline, emitting progress via onProgress(event).
 * onProgress receives plain objects: { type, step?, message, ... }
 *
 * Resolves with { assessment, costUsd, date }.
 */
export async function runAnalysis({ onProgress } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const date = getTodayInTimezone(timezone);

  const filePaths = [resolveHomefrontMdPath()];
  if (!existsSync(filePaths[0])) {
    throw new Error(
      'articles-homefront.md not found. Run the home-front ingest (e.g. extract-homefront-articles) or set HOMEFRONT_MD.',
    );
  }

  onProgress?.({ type: 'progress', step: 'load', message: `Loading articles from ${basename(filePaths[0])}...` });

  const { articles: rawArticles, totalCount } = loadMdFiles(filePaths);

  const uniqueCount = countUniqueByTitle(rawArticles);
  onProgress?.({
    type: 'progress',
    step: 'loaded',
    message: `${uniqueCount} unique articles (${totalCount} total, ${totalCount - uniqueCount} dupes removed)`,
  });

  let totalCostUsd = 0;
  const onUsage = ({ label, model, usage }) => {
    const p = PRICING[model];
    const cost = p
      ? (usage.input_tokens / 1_000_000) * p.input + (usage.output_tokens / 1_000_000) * p.output
      : 0;
    totalCostUsd += cost;
    onProgress?.({ type: 'usage', label, costUsd: totalCostUsd });
  };

  const batch = contentBatchFromMdArticles(rawArticles, {
    reportDate: date,
    contentKind: 'news',
  });

  const llmPort = createAnthropicResilienceLlmAdapter();
  const reportWriterPort = createResilienceReportFsAdapter();
  const { base } = reportPaths(date);
  const reportSourceFiles = filePaths.map((f) => basename(f));

  const { assessment, signals } = await runResilienceAssessment(batch, {
    llmPort,
    reportWriterPort,
    dedupeTitles: true,
    persist: true,
    outputBase: base,
    reportSourceFiles,
    onProgress,
    onUsage,
  });

  onProgress?.({
    type: 'progress',
    step: 'evidence_done',
    message: `${signals.length} behavioral signals extracted`,
  });

  onProgress?.({ type: 'progress', step: 'done', message: `Report saved. Total cost: $${totalCostUsd.toFixed(4)}` });

  return { assessment, costUsd: totalCostUsd, date };
}
