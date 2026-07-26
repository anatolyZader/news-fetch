/**
 * CLI body for sending municipal PBO feedback from a revised batch.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultPboReportReviewService } from './createPboReviewWiring.js';
import { resolveSqlitePath } from '../../../cross-cut-modules/config/sqlitePath.js';
import { parsePboReviewDate } from '../domain/services/pboReviewBatch.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv) {
  const getArg = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    dateRaw: getArg('--date'),
    batchPath: getArg('--from-batch'),
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
  };
}

/**
 * @param {string[]} argv
 * @param {{ mailingDeliveryPort?: object|null }} [wiring]
 * @returns {Promise<number>}
 */
export async function runSendMunicipalPboFeedbackCli(argv, wiring = {}) {
  const { dateRaw, batchPath, force, dryRun } = parseArgs(argv);
  if (!dateRaw) {
    throw new Error('--date is required (YYYY-MM-DD or dd:mm:yyyy)');
  }
  const date = parsePboReviewDate(dateRaw);
  const sqlitePath = resolveSqlitePath(process.env, repoRoot);
  const service = createDefaultPboReportReviewService({
    repoRoot,
    sqlitePath,
    mailingDeliveryPort: wiring.mailingDeliveryPort ?? null,
  });
  const result = await service.sendDayFeedback(date, {
    batchPath: batchPath || undefined,
    repoRoot,
    force,
    dryRun,
  });
  console.error(JSON.stringify(result, null, 2));
  const failed = (result.outcomes ?? []).filter((o) => o.emailError && !o.emailSkipped);
  return failed.length ? 1 : 0;
}
