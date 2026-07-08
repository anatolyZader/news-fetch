#!/usr/bin/env node
/**
 * One-time: rename compact report date token YYMMDD → DDMMYY.
 *
 *   node scripts/migrate-report-compact-date-to-ddmmyy.js
 *   node scripts/migrate-report-compact-date-to-ddmmyy.js --apply
 */
import { existsSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPACT_REPORT_BASENAME_RE,
  ddMmYyFromIsoDate,
  isoDateFromYyMmDd,
} from '../business_modules/resilience_scorer/domain/services/paths/reportNames.js';
import { resilienceReportsDir } from '../business_modules/resilience_scorer/domain/services/paths/outputDirs.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const reportsDir = resilienceReportsDir(REPO_ROOT);

/** Legacy YYMMDD tokens from first compact migration (year 24–30). */
function isLegacyYyMmDdToken(token) {
  const yy = Number.parseInt(token.slice(0, 2), 10);
  return yy >= 24 && yy <= 30;
}

function planMoves() {
  /** @type {Array<{ from: string, to: string }>} */
  const moves = [];

  for (const name of readdirSync(reportsDir)) {
    const base = name.replace(/(-brief)?\.(json|md)$/i, '');
    const m = COMPACT_REPORT_BASENAME_RE.exec(base);
    if (!m) continue;

    const token = m[3];
    if (!isLegacyYyMmDdToken(token)) continue;

    const iso = isoDateFromYyMmDd(token);
    const newToken = ddMmYyFromIsoDate(iso);
    if (newToken === token) continue;

    const newBase = base.replace(`-${token}-`, `-${newToken}-`);
    const suffix = name.slice(base.length);
    const to = `${newBase}${suffix}`;
    if (to === name) continue;
    moves.push({ from: name, to });
  }

  moves.sort((a, b) => a.from.localeCompare(b.from));
  return moves;
}

function main() {
  const moves = planMoves();
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'}: ${moves.length} renames in ${reportsDir}`);
  for (const { from, to } of moves) {
    const dest = join(reportsDir, to);
    if (existsSync(dest)) {
      console.error(`blocked: target exists ${to}`);
      process.exit(1);
    }
    console.log(`  ${from}  →  ${to}`);
  }
  if (!APPLY) {
    console.log('\nRe-run with --apply to execute.');
    return;
  }
  for (const { from, to } of moves) {
    renameSync(join(reportsDir, from), join(reportsDir, to));
  }
  console.log(`Done: ${moves.length} files renamed.`);
}

main();
