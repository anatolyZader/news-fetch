#!/usr/bin/env node
/**
 * Rebuild RAG chunk index from source_archive for a date window.
 *
 * Usage: node db/input/reindexRag.js [--days 14]
 */
import 'dotenv/config';
import { createSourceArchive } from '../source_archive/createSourceArchive.js';
import { createRetrievalService } from '../../cross-cut-modules/retrieval/index.js';
import { getTodayInTimezone } from '../../utils/dateUtils.js';
import { resolveSqlitePath } from '../../cross-cut-modules/config/sqlitePath.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--days');
  const days = i >= 0 ? Number.parseInt(args[i + 1], 10) : 14;
  return { days: Number.isFinite(days) ? days : 14 };
}

function datesInWindow(today, days) {
  const out = [];
  const base = new Date(`${today}T12:00:00`);
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function main() {
  const { days } = parseArgs();
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const today = getTodayInTimezone(timezone);
  const dates = datesInWindow(today, days);
  const sqlitePath = resolveSqlitePath();

  const retrievalService = createRetrievalService({ dbPath: sqlitePath, timezone });
  const archive = createSourceArchive(sqlitePath);

  let total = 0;
  for (const date of dates) {
    const rows = archive.listByDate(date) ?? [];
    const r = await retrievalService.indexWriter.reindexArchiveRows(rows);
    total += r.chunks;
    console.error(`  ${date}: ${rows.length} sources → ${r.chunks} chunks`);
  }
  retrievalService.rebuildFts();
  archive.close();
  retrievalService.close();
  console.log(`rag:reindex complete: days=${days} total_chunks=${total}`);
}

try {
  await main();
} catch (err) {
  console.error('reindexRag failed:', err.message);
  process.exit(1);
}
