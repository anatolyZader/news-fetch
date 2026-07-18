#!/usr/bin/env node
/**
 * Run municipal PBO completeness review for one date (pipeline / cron).
 *
 * Usage:
 *   node runMunicipalPboReview.js --date YYYY-MM-DD [--force] [--dry-run]
 */
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultPboReportReviewService } from '../app/createPboReviewWiring.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { createPboHistoricalSearchService } from '../app/pboHistoricalSearchService.js';
import { resolveSqlitePath } from '../../../cross-cut-modules/config/sqlitePath.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv) {
  const getArg = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    date: getArg('--date') ?? new Date().toISOString().slice(0, 10),
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    query: getArg('--query'),
    municipality: getArg('--municipality'),
  };
}

const { date, force, dryRun, query, municipality } = parseArgs(process.argv.slice(2));
const sqlitePath = resolveSqlitePath(process.env, repoRoot);

try {
  if (query) {
    const retrievalService = createRetrievalService({ dbPath: sqlitePath });
    const search = createPboHistoricalSearchService({ retrievalService });
    const { hits } = await search.search({
      query,
      date,
      municipality,
      days: Number.parseInt(process.env.PBO_RAG_RETENTION_DAYS ?? '30', 10) || 30,
    });
    retrievalService.close();
    console.error(`PBO historical search (${hits.length} hits):`);
    for (const h of hits) {
      console.error(`  [${h.date}] ${h.title ?? h.source_id}: ${h.snippet}`);
    }
    process.exit(0);
  }

  const service = createDefaultPboReportReviewService({ repoRoot, sqlitePath });
  const result = await service.reviewDay(date, { force, dryRun });
  console.error(JSON.stringify(result, null, 2));
  if (result.skipped) process.exit(0);
  const failed = (result.results ?? []).filter((r) => r.emailError);
  process.exit(failed.length ? 1 : 0);
} catch (err) {
  console.error('runMunicipalPboReview failed:', err.message);
  process.exit(1);
}
