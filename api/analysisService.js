/**
 * Analysis service — orchestrates the full resilience analysis pipeline via business_modules/resilience.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, basename, dirname, isAbsolute, join } from 'path';
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

/** Dedup key aligned with evidence_store unique (url + title fingerprint). */
function evidenceDedupKey(a) {
  const u = (a.url ?? '').trim();
  const t = (a.title ?? '').replace(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
  return `${u}|${t}`;
}

/**
 * Prefer broad news file first, then add DB-only rows (e.g. audio/video) without duplicates.
 * @param {Array<{ title: string, body: string, url?: string, publishedAt?: string, source?: string, sourceFile?: string }>} fileArticles
 * @param {Array<{ title: string, body: string, url?: string, publishedAt?: string, source?: string, sourceFile?: string }>} dbArticles
 */
function mergeHomefrontAndDbEvidence(fileArticles, dbArticles) {
  const seen = new Set();
  const out = [];
  for (const a of fileArticles) {
    const k = evidenceDedupKey(a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  for (const a of dbArticles) {
    const k = evidenceDedupKey(a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
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

function readAssessmentTotalArticles(jsonPath) {
  try {
    const raw = readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    const n = parsed?.assessment?.total_articles_analyzed;
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  } catch {
    return -1;
  }
}

/**
 * Prefer `resilience-report-{date}.json`; else best `resilience-report-{date}-*.json` (CLI runs add HHMM).
 * When several timestamped files exist for the same day, prefer the one with the largest
 * `assessment.total_articles_analyzed` (full merge beats a later slim/audio-only run); tie-break on newest mtime.
 * @param {string} date YYYY-MM-DD
 * @param {{ reportsDir?: string }} [opts] `reportsDir` overrides the default `reports/` (for tests).
 * @returns {string | null} absolute path
 */
export function resolveReportJsonPathForDate(date, opts = {}) {
  const reportsDir = opts.reportsDir ?? resolve(ROOT, 'reports');
  if (!existsSync(reportsDir)) return null;

  const exact = resolve(reportsDir, `resilience-report-${date}.json`);
  if (existsSync(exact)) return exact;

  const prefix = `resilience-report-${date}-`;
  let names;
  try {
    names = readdirSync(reportsDir);
  } catch {
    return null;
  }

  const candidates = names.filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  if (candidates.length === 0) return null;

  let bestPath = null;
  let bestArticles = -Infinity;
  let bestMtime = -1;
  for (const f of candidates) {
    const p = join(reportsDir, f);
    try {
      const articles = readAssessmentTotalArticles(p);
      const m = statSync(p).mtimeMs;
      if (
        articles > bestArticles ||
        (articles === bestArticles && m > bestMtime)
      ) {
        bestArticles = articles;
        bestMtime = m;
        bestPath = p;
      }
    } catch {
      /* skip */
    }
  }
  return bestPath;
}

/**
 * Return today's cached report payload `{ assessment, signals?, markdown?, ... }`, or null if none exists.
 *
 * **Filesystem first:** the best `resilience-report-{date}-*.json` under `reports/` (highest
 * `total_articles_analyzed`, then newest mtime; sibling `.md` loaded when present) is the canonical rich export.
 * SQLite is used only when no JSON exists for that date.
 *
 * @param {import('../cross-cut-modules/persistence/evidenceStore.js').ReturnType<createEvidenceStore>} [store]
 */
export function getCachedReport(store) {
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const date = getTodayInTimezone(timezone);

  const jsonPath = resolveReportJsonPathForDate(date);
  if (jsonPath && existsSync(jsonPath)) {
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    const mdPath = jsonPath.replace(/\.json$/i, '.md');
    let markdown = null;
    if (existsSync(mdPath)) {
      try {
        markdown = readFileSync(mdPath, 'utf8');
      } catch {
        /* ignore */
      }
    }
    return { ...parsed, markdown };
  }

  if (store) {
    const run = store.getLatestRunForDate(date);
    if (run) {
      return {
        assessment: run.reportJson,
        markdown: run.reportMd ?? null,
      };
    }
  }

  return null;
}

/**
 * Run full analysis pipeline, emitting progress via onProgress(event).
 * onProgress receives plain objects: { type, step?, message, ... }
 *
 * If `store` is provided and has rows for today: **merges** `articles-homefront.md` (or `HOMEFRONT_MD`)
 * with those rows when the file exists (news first, then DB-only items; deduped by URL/title).
 * If the file is missing, uses DB only. If DB is empty for today, loads the MD file only (same as before).
 *
 * Resolves with { assessment, costUsd, date }.
 * @param {{ onProgress?: Function, store?: object }} [opts]
 */
export async function runAnalysis({ onProgress, store } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const date = getTodayInTimezone(timezone);

  let rawArticles;
  let sourceFiles;
  let sourceTypes = [];

  // ── DB + optional homefront merge, else MD file only ───────────────────────
  if (store && store.hasItemsForDate(date)) {
    const rows = store.getByDate(date);
    const typesFromDb = [...new Set(rows.map((r) => r.source_type))];
    const dbArticles = rows.map((r) => ({
      title: r.title ?? '(untitled)',
      body: r.body,
      url: r.source_url ?? '',
      publishedAt: r.published_at,
      source: r.source_label,
      sourceFile: `db:${r.source_type}`,
    }));

    const homePath = resolveHomefrontMdPath();
    let fileArticles = [];
    if (existsSync(homePath)) {
      try {
        fileArticles = loadMdFiles([homePath]).articles;
      } catch (err) {
        onProgress?.({
          type: 'progress',
          step: 'load',
          message: `Could not parse ${basename(homePath)}: ${err.message} — using DB only`,
        });
      }
    }

    if (fileArticles.length > 0) {
      rawArticles = mergeHomefrontAndDbEvidence(fileArticles, dbArticles);
      sourceTypes = [...new Set([...typesFromDb, 'news'])];
      sourceFiles = [basename(homePath), ...typesFromDb.map((t) => `db:${t}`)];
      onProgress?.({
        type: 'progress',
        step: 'load',
        message: `Merged ${fileArticles.length} from ${basename(homePath)} + ${dbArticles.length} from DB → ${rawArticles.length} unique items (${typesFromDb.join(', ')})`,
      });
    } else {
      rawArticles = dbArticles;
      sourceTypes = typesFromDb;
      sourceFiles = typesFromDb.map((t) => `db:${t}`);
      onProgress?.({
        type: 'progress',
        step: 'load',
        message: `Loading ${rows.length} items from DB only (${sourceTypes.join(', ')})${existsSync(homePath) ? ` — ${basename(homePath)} had no parseable articles` : ` — ${basename(homePath)} missing`}`,
      });
    }
  } else {
    const filePaths = [resolveHomefrontMdPath()];
    if (!existsSync(filePaths[0])) {
      throw new Error(
        'articles-homefront.md not found. Run the home-front ingest (e.g. extract-homefront-articles) or set HOMEFRONT_MD.',
      );
    }
    onProgress?.({ type: 'progress', step: 'load', message: `Loading articles from ${basename(filePaths[0])}...` });
    const loaded = loadMdFiles(filePaths);
    rawArticles = loaded.articles;
    sourceFiles = filePaths.map((f) => basename(f));
    sourceTypes = ['news'];
  }

  const uniqueCount = countUniqueByTitle(rawArticles);
  onProgress?.({
    type: 'progress',
    step: 'loaded',
    message: `${uniqueCount} unique items from ${sourceTypes.join(', ')}`,
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

  const contentKind = sourceTypes.length === 1 && sourceTypes[0] === 'audio' ? 'audio' : 'news';

  const batch = contentBatchFromMdArticles(rawArticles, {
    reportDate: date,
    contentKind,
  });

  const llmPort = createAnthropicResilienceLlmAdapter();
  const reportWriterPort = createResilienceReportFsAdapter();
  const { base } = reportPaths(date);

  const { assessment, signals } = await runResilienceAssessment(batch, {
    llmPort,
    reportWriterPort,
    dedupeTitles: true,
    persist: true,
    outputBase: base,
    reportSourceFiles: sourceFiles,
    onProgress,
    onUsage,
  });

  // Save to DB (include Markdown body when the writer produced a sibling .md file)
  if (store) {
    try {
      const mdPath = `${base}.md`;
      const reportMd = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : null;
      store.saveRun({
        date,
        reportJson: assessment,
        reportMd,
        sourceTypes,
        totalItems: rawArticles.length,
        totalSignals: signals.length,
      });
    } catch (err) {
      console.error(`  ⚠ DB run save failed (continuing): ${err.message}`);
    }
  }

  onProgress?.({
    type: 'progress',
    step: 'evidence_done',
    message: `${signals.length} behavioral signals extracted`,
  });

  onProgress?.({ type: 'progress', step: 'done', message: `Report saved. Total cost: $${totalCostUsd.toFixed(4)}` });

  return { assessment, costUsd: totalCostUsd, date };
}
