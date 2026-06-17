import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadMdFiles } from '../../resilience/index.js';
import {
  createCostTracker,
  appendCostLog,
  checkDailyBudget,
} from '../../../cross-cut-modules/budget/index.js';
import { createDefaultSignalsExtractionService } from './signalsExtractionService.js';
import { isValidProfile, OBSERVATION_PROFILES } from '../domain/services/observationSchema.js';

function parseCli(argv) {
  const getArg = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    profile: getArg('--profile') ?? 'exploratory',
    filesArg: getArg('--files'),
    date: getArg('--date') ?? new Date().toISOString().slice(0, 10),
    contentKind: getArg('--content-kind') ?? 'mixed',
    sourceType: getArg('--source-type') ?? 'adhoc',
  };
}

export async function runExtractObservationsCli() {
  const cli = parseCli(process.argv.slice(2));

  if (!isValidProfile(cli.profile)) {
    console.error(`Usage: --profile ${OBSERVATION_PROFILES.join('|')} --files <csv> --date YYYY-MM-DD`);
    process.exit(1);
  }
  if (!cli.filesArg) {
    console.error('Error: --files is required');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }

  const filePaths = cli.filesArg.split(',').map((f) => resolve(f.trim()));
  for (const fp of filePaths) {
    if (!existsSync(fp)) {
      console.error(`File not found: ${fp}`);
      process.exit(1);
    }
  }

  checkDailyBudget();

  const { articles, date: parsedDate, totalCount } = loadMdFiles(filePaths);
  const date = cli.date ?? parsedDate;
  console.error(`Open extraction: profile=${cli.profile} date=${date} articles=${totalCount}`);

  const { onUsage, getTotal } = createCostTracker({ label: 'extract-observations' });

  const service = createDefaultSignalsExtractionService();
  const { path, observationCount } = await service.extractAndSave(articles, {
    profile: cli.profile,
    date,
    contentKind: cli.contentKind,
    sourceType: cli.sourceType,
    sourceFiles: filePaths,
    onUsage,
  });

  const { totalCostUsd, usageLog, stageEvents } = getTotal();
  if (totalCostUsd > 0) {
    appendCostLog({
      date,
      script: 'extract-observations',
      totalCostUsd,
      usageLog,
      stageEvents,
      articles: totalCount,
    });
  }

  console.error(`\nObservation bundle written: ${path} (${observationCount} observations)`);
}
