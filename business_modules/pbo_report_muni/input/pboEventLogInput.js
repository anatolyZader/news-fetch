/**
 * CLI transport: stdin/file → runPboEventLogAnalysisFromParsed (dotenv, argv, stderr progress).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

import { parseEventLog, inferDate } from '../domain/services/eventLogLoader.js';
import { runPboEventLogAnalysisFromParsed } from '../app/pboEventLogAnalysisService.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';

export async function runPboEventLogCli() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set. Add it to .env or the environment.');
    process.exit(1);
  }

  checkDailyBudget();
  const { onUsage, getTotal, printSummary } = createCostTracker({ label: 'analyze-event-log' });

  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : null;
  };

  const fileArg = getArg('--file');
  const dateArg = getArg('--date');
  const outputArg = getArg('--output');

  let rawText;
  let sourceName;

  if (fileArg) {
    const filePath = resolve(fileArg);
    rawText = readFileSync(filePath, 'utf-8');
    sourceName = basename(filePath);
  } else {
    rawText = readFileSync('/dev/stdin', 'utf-8');
    sourceName = 'stdin';
  }

  const parsedLog = parseEventLog(rawText, sourceName);
  if (parsedLog.events.length === 0) {
    console.error('No events found in input. Check the format:\n  time | actor | behavior | category | context | source');
    process.exit(1);
  }

  const reportDate = dateArg ?? inferDate(parsedLog, new Date().toISOString().slice(0, 10));
  const outputBase =
    outputArg?.replace(/\.(md|json)$/, '') ??
    resolve('daily_reports', `event-report-${reportDate}`);

  console.error(`\nPBO Event Log Resilience Analysis`);
  console.error(`==================================`);
  console.error(`Log:    ${parsedLog.title}`);
  console.error(`Date:   ${reportDate}`);
  console.error(`Source: ${sourceName}`);
  console.error(`Events: ${parsedLog.events.length}`);
  console.error(`Output: ${outputBase}.(md|json)`);
  console.error('');

  try {
    const { assessment, classifications, paths } = await runPboEventLogAnalysisFromParsed(
      parsedLog,
      reportDate,
      outputBase,
      sourceName,
      { onUsage },
    );

    console.error(`  → ${classifications.length} events classified\n`);

    console.error('\n=== Resilience Scores ===');
    for (const comp of assessment.components ?? []) {
      const trend = { improving: '↑', stable: '→', degrading: '↓', unclear: '?' }[comp.temporal_trend] ?? '';
      console.error(
        `  ${comp.component_id.padEnd(28)} ${comp.score}/10  (${comp.confidence}) ${trend}`,
      );
    }
    console.error(`  ${'OVERALL'.padEnd(28)} ${assessment.overall_resilience_score}/10`);
    console.error('');
    console.error('Reports written:');
    console.error(`  ${paths.mdPath}`);
    console.error(`  ${paths.jsonPath}`);

    printSummary();
    const { totalCostUsd, usageLog } = getTotal();
    appendCostLog({
      script: 'analyze-event-log',
      date: reportDate,
      totalCostUsd,
      usageLog,
      articles: parsedLog.events.length,
    });
  } catch (err) {
    console.error('\nAnalysis failed:', err.message);
    if (err.status) console.error('API status:', err.status);
    process.exit(1);
  }
}
