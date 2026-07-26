#!/usr/bin/env node
/**
 * Convert regional PBO markdown reports into resilience signal JSON + pipeline open observations.
 *
 * Usage:
 *   node extract-regional-pbo-signals.js --files <f1.md,f2.md,...> --date YYYY-MM-DD
 *
 * Output:
 *   business_modules/resilience_scorer/data/signals/signals-pbo_regional-YYYY-MM-DD.json
 *   business_modules/open_observation_extraction/data/observations-pipeline-pbo_regional-YYYY-MM-DD.json
 */

import 'dotenv/config';
import { basename, dirname, extname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getDefaultResilienceLlmPort, runExtractionStage, applyFieldReportSignalHygiene } from '../../resilience_scorer/index.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';
import { attributeSignalScope } from '../../../cross-cut-modules/geo/attributeSignalScope.js';
import { createSourceArchive } from '../../../db/source_archive/createSourceArchive.js';
import { buildArchiveSourceId } from '../../../db/source_archive/sourceId.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { closedSignalsDir } from '../../resilience_scorer/index.js';
import { resolveSqlitePath } from '../../../cross-cut-modules/config/sqlitePath.js';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const MAX_BODY_CHARS = 2000;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
const FRONTMATTER_LINE_RE = /^([A-Za-z0-9_-]+):\s*(.*)$/;
const HEADING_RE = /^#\s+(.+)$/m;

function getArg(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function stripFrontmatter(content) {
  const raw = String(content ?? '');
  if (!raw.startsWith('---\n')) return { metadata: {}, body: raw };
  const end = raw.indexOf('\n---', 4);
  if (end < 0) return { metadata: {}, body: raw };
  const metadata = {};
  for (const line of raw.slice(4, end).split('\n')) {
    const match = FRONTMATTER_LINE_RE.exec(line);
    if (!match) continue;
    metadata[match[1].trim().toLowerCase()] = match[2].trim().replaceAll(/^["']|["']$/g, '');
  }
  return { metadata, body: raw.slice(end + 4).replace(/^\s+/, '') };
}

function inferDateFromName(fileName, metadata, filterDate) {
  const fromMeta = String(metadata.date ?? '').trim();
  const metaMatch = DATE_RE.exec(fromMeta);
  if (metaMatch) return metaMatch[1];
  const nameMatch = DATE_RE.exec(basename(fileName));
  if (nameMatch) return nameMatch[1];
  return filterDate;
}

function inferTitle(body, fileName) {
  const headingMatch = HEADING_RE.exec(String(body ?? ''));
  const heading = headingMatch?.[1]?.trim();
  return heading || basename(fileName, extname(fileName));
}

function loadRegionalPboArticle(filePath, filterDate) {
  const content = readFileSync(filePath, 'utf8');
  const { metadata, body } = stripFrontmatter(content);
  const fileDate = inferDateFromName(filePath, metadata, filterDate);
  if (fileDate !== filterDate) return null;

  const title = inferTitle(body, filePath);
  const trimmedBody = String(body ?? '').trim().slice(0, MAX_BODY_CHARS);

  return {
    title,
    url: '',
    publishedAt: fileDate,
    source: `pbo-regional:${basename(filePath, extname(filePath))}`,
    body: trimmedBody,
    sourceFile: basename(filePath),
    temporal_weight: 1,
  };
}

function parseRunArgs(args) {
  const filesArg = getArg(args, '--files');
  const date = getArg(args, '--date') ?? new Date().toISOString().slice(0, 10);
  if (!filesArg) {
    console.error('Usage: extract-regional-pbo-signals.js --files <f1.md,f2.md,...> --date YYYY-MM-DD');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY && process.env.LLM_TRANSPORT !== 'claude-cli') {
    console.error('Error: ANTHROPIC_API_KEY is not set (or use LLM_TRANSPORT=claude-cli)');
    process.exit(1);
  }
  return { filesArg, date };
}

function resolveAndValidateFilePaths(filesArg) {
  const filePaths = filesArg.split(',').map((f) => resolve(f.trim())).filter(Boolean);
  for (const fp of filePaths) {
    if (!existsSync(fp)) {
      console.error(`File not found: ${fp}`);
      process.exit(1);
    }
  }
  return filePaths;
}

function loadArticlesForDate(filePaths, date) {
  const articles = [];
  for (const fp of filePaths) {
    const ext = extname(fp).toLowerCase();
    if (ext !== '.md' && ext !== '.markdown') continue;
    const article = loadRegionalPboArticle(fp, date);
    if (article) articles.push(article);
  }
  if (articles.length === 0) {
    console.error(`No regional PBO markdown matched date=${date}`);
    process.exit(0);
  }
  return articles;
}

function buildArchiveItems(articles, date) {
  const indexToSourceId = new Map();
  const items = articles.map((a, i) => {
    const item = {
      date,
      source_type: 'pbo_regional',
      source_label: a.source,
      source_url: a.url || null,
      title: a.title,
      body: a.body,
      published_at: a.publishedAt ?? date,
      module_ref: a.sourceFile,
      scope_id: 'north',
    };
    item.source_id = buildArchiveSourceId(item);
    indexToSourceId.set(i + 1, item.source_id);
    return item;
  });
  return { items, indexToSourceId };
}

async function archiveRegionalPboArticles(articles, date, signals) {
  const sqlitePath = resolveSqlitePath(process.env, REPO_ROOT);
  const retrievalService = createRetrievalService({ dbPath: sqlitePath });
  const archive = createSourceArchive(sqlitePath, { retrievalIndexer: retrievalService });
  const { items, indexToSourceId } = buildArchiveItems(articles, date);
  for (const item of items) {
    archive.upsert(item);
    if (retrievalService.indexArchiveRow) {
      await retrievalService.indexArchiveRow(item);
    }
  }
  retrievalService.rebuildFts();
  retrievalService.close();
  archive.close();
  const enriched = signals.map((s) => {
    const sid = s.article_index == null ? null : indexToSourceId.get(Number(s.article_index));
    return sid ? { ...s, source_id: sid } : s;
  });
  if (items.length > 0) console.error(`  → ${items.length} regional PBO original(s) archived`);
  return enriched;
}

function writeRegionalSignalsBundle({ date, articles, signals, districtId }) {
  const outDir = closedSignalsDir();
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `signals-pbo_regional-${date}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        source_type: 'pbo_regional',
        content_kind: 'field_report',
        district_id: districtId,
        date,
        extracted_at: new Date().toISOString(),
        source_files: articles.map((a) => a.sourceFile),
        total_articles: articles.length,
        signals,
      },
      null,
      2,
    ),
    'utf-8',
  );
  console.error(`\nSignal file written: ${outPath}`);
}

async function run() {
  const args = process.argv.slice(2);
  const { filesArg, date } = parseRunArgs(args);
  checkDailyBudget();

  const filePaths = resolveAndValidateFilePaths(filesArg);
  const articles = loadArticlesForDate(filePaths, date);
  const { onUsage, getTotal } = createCostTracker({ label: 'extract-regional-pbo-signals' });

  console.error(`\nSignal Extraction  source=pbo_regional  kind=field_report`);
  console.error(`===================`);
  console.error(`Date: ${date}`);
  console.error(`Files: ${filePaths.map((f) => basename(f)).join(', ')}`);
  console.error(`Articles loaded: ${articles.length}\n`);

  const districtId = 'north';
  const llmPort = getDefaultResilienceLlmPort();

  await runExtractionStage({
    repoRoot: REPO_ROOT,
    articles,
    sourceType: 'pbo_regional',
    contentKind: 'field_report',
    date,
    filePaths,
    onUsage,
    retrievalService: null,
    closedExtractFn: async ({ articles: arts, onUsage: usageCb }) => {
      const rawSignals = await llmPort.extractSignals(arts, { onUsage: usageCb, contentKind: 'field_report' });
      let signals = applyFieldReportSignalHygiene(
        rawSignals.map((s) => ({ ...s, source_type: 'pbo_regional' })),
      );

      try {
        signals = await archiveRegionalPboArticles(arts, date, signals);
      } catch (err) {
        console.error(`  ⚠ Regional PBO archive skipped: ${err.message}`);
      }

      const { signals: attributed, attached, resolved, unknown } = attributeSignalScope(signals, {
        rootDir: REPO_ROOT,
        sourceType: 'pbo_regional',
        bundleDistrictId: districtId,
        unknownSourceType: 'extract-pbo_regional',
      });
      signals = attributed;

      console.error(`\n→ ${signals.length} signals extracted`);
      if (attached > 0) {
        console.error(`  → Geo attach: ${attached} signals, ${resolved} resolved, ${unknown} unknown`);
      }

      writeRegionalSignalsBundle({ date, articles: arts, signals, districtId });
      return { signals };
    },
  });

  const { totalCostUsd, usageLog } = getTotal();
  appendCostLog({ script: 'extract-regional-pbo-signals', date, totalCostUsd, usageLog, articles: articles.length });
}

try {
  await run();
} catch (err) {
  console.error('extract-regional-pbo-signals failed:', err.message);
  process.exit(1);
}
