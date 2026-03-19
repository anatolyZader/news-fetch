/**
 * Analysis service — orchestrates the full resilience analysis pipeline.
 * Calls extractEvidence + synthesizeComponents and writes the report.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

import { getTodayInTimezone } from '../dateUtils.js';
import { loadMdFiles, findArticlesMdFiles } from '../resilience/mdReportsLoader.js';
import { extractEvidence, synthesizeComponents } from '../resilience/claudeEvaluator.js';
import { writeReport } from '../resilience/reportWriter.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
};

function reportPaths(date) {
  const base = resolve(ROOT, 'resilience', `resilience-report-${date}`);
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

  const filePaths = findArticlesMdFiles(ROOT);
  if (filePaths.length === 0) {
    throw new Error('No articles-*.md files found. Run the article fetch scripts first.');
  }

  onProgress?.({ type: 'progress', step: 'load', message: `Loading articles from ${filePaths.length} source file(s)...` });

  const { articles: rawArticles, totalCount } = loadMdFiles(filePaths);

  // Cross-site deduplication
  const _seen = new Set();
  const articles = rawArticles.filter((a) => {
    const key = a.title.replace(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
    if (_seen.has(key)) return false;
    _seen.add(key);
    return true;
  });

  onProgress?.({ type: 'progress', step: 'loaded', message: `${articles.length} unique articles (${totalCount} total, ${totalCount - articles.length} dupes removed)` });

  // Cost tracking
  let totalCostUsd = 0;
  const onUsage = ({ label, model, usage }) => {
    const p = PRICING[model];
    const cost = p
      ? (usage.input_tokens / 1_000_000) * p.input + (usage.output_tokens / 1_000_000) * p.output
      : 0;
    totalCostUsd += cost;
    onProgress?.({ type: 'usage', label, costUsd: totalCostUsd });
  };

  const evidenceSnippets = await extractEvidence(articles, { onUsage, onProgress });
  onProgress?.({ type: 'progress', step: 'evidence_done', message: `${evidenceSnippets.length} evidence snippets extracted` });

  const assessment = await synthesizeComponents(evidenceSnippets, date, totalCount, { onUsage, onProgress });

  const sourceFiles = filePaths.map((f) => basename(f));
  const { base } = reportPaths(date);
  writeReport(assessment, evidenceSnippets, sourceFiles, base);

  onProgress?.({ type: 'progress', step: 'done', message: `Report saved. Total cost: $${totalCostUsd.toFixed(4)}` });

  return { assessment, costUsd: totalCostUsd, date };
}
