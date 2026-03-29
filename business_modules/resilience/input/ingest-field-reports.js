#!/usr/bin/env node
/**
 * Convert a field-report .xlsx (population behavior officer visits to municipalities)
 * to the markdown format consumed by the resilience analysis pipeline.
 *
 * Usage:
 *   npm run ingest-field-reports -- --file north_muni_data_1.xlsx
 *   npm run ingest-field-reports -- --file <path.xlsx> --output articles-field-reports-YYYY-MM-DD.md
 *
 * Expected sheet columns (Hebrew headers tolerated; matched by position/name):
 *   id | date | team | municipality | region | stakeholders | expert analysis
 *
 * Output: articles-field-reports-<latest-visit-date>.md
 * Each row becomes one "article" (community visit document).
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, basename } from 'path';
import { read, utils } from 'xlsx';

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
const rows = utils.sheet_to_json(ws, { defval: '' });

if (rows.length === 0) {
  console.error('No rows found in spreadsheet.');
  process.exit(1);
}

// Determine latest visit date for default output filename
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  // Excel stores dates as numeric serial numbers (days since 1899-12-30)
  if (typeof val === 'number' && val > 1000) {
    return new Date((val - 25569) * 86400 * 1000);
  }
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

const allDates = rows.map((r) => parseDate(r['date'])).filter(Boolean);
const latestDate = allDates.length
  ? new Date(Math.max(...allDates.map((d) => d.getTime()))).toISOString().slice(0, 10)
  : new Date().toISOString().slice(0, 10);

const outputPath = getArg('--output') ?? resolve(`articles-field-reports-${latestDate}.md`);

// Column name aliases (the xlsx may have trailing spaces)
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
  `Population behavior officer visits to northern border communities (${basename(filePath)}).`,
  `Each entry is one expert team visit to one municipality — direct stakeholder interviews and field observation.`,
  ``,
];

let count = 0;

for (const row of rows) {
  const municipality = col(row, 'municipality ', 'municipality');
  const region       = col(row, 'region ', 'region');
  const team         = col(row, 'team');
  const stakeholders = col(row, 'stkeholders', 'stakeholders');
  const analysis     = col(row, 'expert analysis', 'expert_analysis');
  const visitDate    = parseDate(row['date'])?.toISOString().slice(0, 10) ?? latestDate;

  if (!analysis) continue;

  const title = `${municipality}${region ? ` — ${region}` : ''} (ביקור שטח)`;
  const source = team || 'field-team';

  // Body: stakeholders context + expert notes
  const bodyParts = [];
  if (stakeholders) bodyParts.push(`גורמים שנפגשו: ${stakeholders}`);
  bodyParts.push(analysis);
  const body = bodyParts.join('\n\n');

  lines.push(`## ${count + 1}. ${title}`);
  lines.push(``);
  lines.push(`- **Published:** ${visitDate}T12:00:00Z`);
  lines.push(`- **Source:** ${source}`);
  lines.push(``);
  lines.push(body);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  count++;
}

writeFileSync(outputPath, lines.join('\n'), 'utf-8');
console.error(`Wrote ${count} field-report visits to ${outputPath}`);
console.error(`  Latest visit date: ${latestDate}`);
console.error(`  Run analysis with: npm run analyze-resilience -- --date YYYY-MM-DD --field-reports ${basename(outputPath)}`);
