#!/usr/bin/env node
/**
 * Convert a field-report .xlsx (professional squad visits to municipalities)
 * to the markdown source format consumed by the resilience analysis pipeline.
 *
 * Usage:
 *   npm run ingest-field-reports -- --file north_muni_data_1.xlsx
 *   npm run ingest-field-reports -- --file <path.xlsx> --output articles-field-reports-YYYY-MM-DD.md
 *
 * Expected sheet columns (Hebrew headers tolerated; matched by position/name):
 *   id | date | team | municipality | region | stakeholders | expert analysis
 *
 * Output: articles-field-reports-<latest-visit-date>.md
 * Each row becomes one source document for one municipal visit.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { read, utils } from 'xlsx';
import { createSourceArchive } from '../../../cross-cut-modules/source_archive/createSourceArchive.js';
import { persistOriginalSources } from '../../../cross-cut-modules/source_archive/persistOriginals.js';
import { articlesToArchiveItems } from '../../../cross-cut-modules/source_archive/articlesToArchiveItems.js';
import { loadMarkdownArticlesFromFile } from '../../../cross-cut-modules/source_archive/markdownArticles.js';

const args = process.argv.slice(2);
const getArg = (flag) => { const idx = args.indexOf(flag); return idx >= 0 ? args[idx + 1] : null; };

const fileArg = getArg('--file');
if (!fileArg) {
  console.error('Usage: npm run ingest-field-reports -- --file <path.xlsx> [--output <path.md>]');
  process.exit(1);
}

const filePath = resolve(fileArg);
const wb = read(readFileSync(filePath));
const ws = wb.Sheets[wb.SheetNames[0]];
let rows = utils.sheet_to_json(ws, { defval: '' });

// If the first row's values look like column names (all __EMPTY_* keys), the real
// header row is row 2 — re-parse starting from that row.
if (rows.length > 0 && Object.keys(rows[0]).every((k) => k.startsWith('__EMPTY'))) {
  rows = utils.sheet_to_json(ws, { defval: '', range: 1 });
}

if (rows.length === 0) {
  console.error('No rows found in spreadsheet.');
  process.exit(1);
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  // Excel stores dates as numeric serial numbers (days since 1899-12-30).
  if (typeof val === 'number' && val > 1000) {
    return new Date((val - 25569) * 86400 * 1000);
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

const allDates = rows.map((r) => parseDate(r.date)).filter(Boolean);
const latestDate = allDates.length
  ? new Date(Math.max(...allDates.map((d) => d.getTime()))).toISOString().slice(0, 10)
  : new Date().toISOString().slice(0, 10);

const defaultOutputDir = resolve('business_modules', 'visits', 'data');
const outputPath = getArg('--output') ?? resolve(defaultOutputDir, `articles-field-reports-${latestDate}.md`);

function col(row, ...keys) {
  for (const k of keys) {
    const val = row[k] ?? row[k.trim()] ?? row[`${k} `] ?? row[` ${k}`];
    if (val !== undefined && val !== '') return String(val).trim();
  }
  return '';
}

const lines = [
  `# Field-reports articles (${latestDate})`,
  ``,
  `Professional squad visits to municipalities (${basename(filePath)}).`,
  `Each entry is one expert team visit to one municipality — direct stakeholder interviews and field observation.`,
  ``,
];

let count = 0;

for (const row of rows) {
  const municipality = col(row, 'municipality ', 'municipality');
  const region       = col(row, 'region ', 'region');
  const team         = col(row, 'team');
  const stakeholders = col(row, 'stkeholders', 'stakeholders');
  const analysis     = col(row, 'expert analysis', 'expert_analysis', 'expert anlysis');
  const visitDate    = parseDate(row.date)?.toISOString().slice(0, 10) ?? latestDate;

  if (!analysis) continue;

  const regionSuffix = region ? ` — ${region}` : '';
  const title = `${municipality}${regionSuffix}`;
  const source = team || 'field-team';
  const bodyParts = [];
  if (stakeholders) bodyParts.push(`גורמים שנפגשו: ${stakeholders}`);
  bodyParts.push(analysis);

  lines.push(
    `## ${count + 1}. ${title}`,
    '',
    `- **Published:** ${visitDate}T12:00:00Z`,
    `- **Source:** ${source}`,
    '',
    bodyParts.join('\n\n'),
    '',
    '---',
    '',
  );
  count++;
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, lines.join('\n'), 'utf-8');
console.error(`Wrote ${count} field-report visits to ${outputPath}`);

try {
  const repoRoot = resolve(dirname(outputPath), '../../..');
  const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(repoRoot, 'data', 'app.sqlite');
  const parsed = loadMarkdownArticlesFromFile(resolve(outputPath));
  const archive = createSourceArchive(sqlitePath);
  const items = articlesToArchiveItems(parsed, {
    date: latestDate,
    source_type: 'field',
    repoRoot,
    module_ref: outputPath,
  });
  const { archived } = persistOriginalSources(archive, items);
  archive.close();
  console.error(`  → ${archived} field report(s) archived`);
} catch (err) {
  console.error(`  ⚠ Source archive failed (continuing): ${err.message}`);
}
console.error(`  Latest visit date: ${latestDate}`);
console.error(`  Run analysis with: npm run extract-signals -- --source-type field --files ${basename(outputPath)} --date YYYY-MM-DD`);
console.error(`  Then: npm run assess-signals -- --date YYYY-MM-DD --days 3 --scope north`);
