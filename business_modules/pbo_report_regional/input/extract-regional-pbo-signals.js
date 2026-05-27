#!/usr/bin/env node
/**
 * Convert regional PBO markdown reports into resilience signal JSON.
 *
 * Keeps `business_modules/resilience/infrastructure/mdReportsLoader.js` unchanged:
 * this script builds the article-shaped objects expected by `extractSignals`.
 *
 * Usage:
 *   node extract-regional-pbo-signals.js --files <f1.md,f2.md,...> --date YYYY-MM-DD
 *
 * Output:
 *   signals/signals-pbo_regional-YYYY-MM-DD.json
 */

import 'dotenv/config';
import { basename, dirname, extname, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { extractSignals } from '../../resilience/infrastructure/claudeEvaluator.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';
import { enrichSignalsWithGeo } from '../../../cross-cut-modules/geo/enrichSignalsWithGeo.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const MAX_BODY_CHARS = 2000;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

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
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    metadata[match[1].trim().toLowerCase()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return { metadata, body: raw.slice(end + 4).replace(/^\s+/, '') };
}

function inferDateFromName(fileName, metadata, filterDate) {
  const fromMeta = String(metadata.date ?? '').trim();
  if (DATE_RE.test(fromMeta)) return fromMeta.match(DATE_RE)[1];
  const fromName = basename(fileName).match(DATE_RE)?.[1] ?? null;
  if (fromName) return fromName;
  return filterDate;
}

function inferTitle(body, fileName) {
  const heading = String(body ?? '').match(/^#\s+(.+)$/m)?.[1]?.trim();
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

async function run() {
  const args = process.argv.slice(2);
  const filesArg = getArg(args, '--files');
  const date = getArg(args, '--date') ?? new Date().toISOString().slice(0, 10);

  if (!filesArg) {
    console.error('Usage: extract-regional-pbo-signals.js --files <f1.md,f2.md,...> --date YYYY-MM-DD');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }

  checkDailyBudget();

  const filePaths = filesArg.split(',').map((f) => resolve(f.trim())).filter(Boolean);
  for (const fp of filePaths) {
    if (!existsSync(fp)) {
      console.error(`File not found: ${fp}`);
      process.exit(1);
    }
  }

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

  const { onUsage, getTotal } = createCostTracker({ label: 'extract-regional-pbo-signals' });

  console.error(`\nSignal Extraction  source=pbo_regional  kind=field_report`);
  console.error(`===================`);
  console.error(`Date: ${date}`);
  console.error(`Files: ${filePaths.map((f) => basename(f)).join(', ')}`);
  console.error(`Articles loaded: ${articles.length}\n`);

  const rawSignals = await extractSignals(articles, { onUsage, contentKind: 'field_report' });
  let signals = rawSignals.map((s) => ({ ...s, source_type: 'pbo_regional' }));
  const { signals: geoSignals, attached, resolved, unknown } = enrichSignalsWithGeo(signals, {
    rootDir: REPO_ROOT,
    unknownSourceType: 'extract-pbo_regional',
  });
  signals = geoSignals;

  console.error(`\n→ ${signals.length} signals extracted`);
  if (attached > 0) {
    console.error(`  → Geo attach: ${attached} signals, ${resolved} resolved, ${unknown} unknown`);
  }

  const outDir = resolve('signals');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `signals-pbo_regional-${date}.json`);

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        source_type: 'pbo_regional',
        content_kind: 'field_report',
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

  const { totalCostUsd, usageLog } = getTotal();
  appendCostLog({ script: 'extract-regional-pbo-signals', date, totalCostUsd, usageLog, articles: articles.length });
}

run().catch((err) => {
  console.error('extract-regional-pbo-signals failed:', err.message);
  process.exit(1);
});
