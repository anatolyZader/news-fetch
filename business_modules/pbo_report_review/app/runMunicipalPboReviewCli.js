/**
 * CLI body for municipal PBO review / batch export (no mail).
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultPboReportReviewService } from './createPboReviewWiring.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { createPboHistoricalSearchService } from './pboHistoricalSearchService.js';
import { resolveSqlitePath } from '../../../cross-cut-modules/config/sqlitePath.js';
import { parsePboReviewDate } from '../domain/services/pboReviewBatch.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv) {
  const getArg = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    dateRaw: getArg('--date') ?? new Date().toISOString().slice(0, 10),
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    exportBatch: argv.includes('--export-batch'),
    out: getArg('--out'),
    query: getArg('--query'),
    municipality: getArg('--municipality'),
  };
}

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {Promise<number>} exit code
 */
export async function runMunicipalPboReviewCli(argv) {
  const { dateRaw, exportBatch, out, query, municipality } = parseArgs(argv);
  const sqlitePath = resolveSqlitePath(process.env, repoRoot);

  if (query) {
    const date = parsePboReviewDate(dateRaw);
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
    return 0;
  }

  const date = parsePboReviewDate(dateRaw);
  const service = createDefaultPboReportReviewService({ repoRoot, sqlitePath });

  if (exportBatch) {
    const result = await service.exportDayBatch(date, { outPath: out || undefined, repoRoot });
    console.error(JSON.stringify(result, null, 2));
    return 0;
  }

  // Legacy path: persist review only (never mail — use send CLI for outbound).
  const result = await service.reviewDay(date, { force: false, dryRun: true });
  console.error(JSON.stringify(result, null, 2));
  return 0;
}
