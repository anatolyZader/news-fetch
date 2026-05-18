/**
 * CLI: analyse field survey responses (Google Forms Excel) for population resilience.
 * @see analyze-survey.js entry
 */
import 'dotenv/config';
import { existsSync } from 'fs';
import { resolve, basename } from 'path';

import { parseSurveyExcel } from '../infrastructure/adapters/surveyExcelLoader.js';
import { analyzeSurvey } from '../app/surveyEvaluator.js';
import { writeMunicipalityReports } from '../app/surveyReportWriter.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';

/**
 * @param {{ geoEnrichmentPort?: { resolveLocalityName: (name: string|null|undefined) => object } }} [options]
 */
export async function runAnalyzeSurveyCli(options = {}) {
  const { geoEnrichmentPort } = options;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const hasFlag = (flag) => args.includes(flag);

  const responsesArg   = getArg('--responses');
  const mappingArg     = getArg('--mapping') ?? 'reports/survey-question-mapping.json';
  const municipalityArg = getArg('--municipality');
  const dateArg        = getArg('--date');
  const listMode       = hasFlag('--list');

  if (!responsesArg) {
    console.error('Usage: npm run analyze-survey -- --responses <path.xlsx> [--municipality <name>] [--date YYYY-MM-DD]');
    process.exit(1);
  }

  const responsesPath = resolve(responsesArg);
  const mappingPath   = resolve(mappingArg);
  const sourceFile    = basename(responsesPath);
  const date          = dateArg ?? new Date().toISOString().slice(0, 10);

  let parsed;
  try {
    parsed = parseSurveyExcel(responsesPath, mappingPath);
  } catch (err) {
    console.error('Failed to parse input:', err.message);
    process.exit(1);
  }

  if (listMode) {
    console.log(`${parsed.municipalities.length} municipalities in ${sourceFile}:\n`);
    parsed.municipalities.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${m.name}`));
    process.exit(0);
  }

  checkDailyBudget();
  const { onUsage, getTotal, printSummary } = createCostTracker({ label: 'analyze-survey' });

  let toProcess;
  if (municipalityArg) {
    toProcess = parsed.municipalities.filter((m) => m.name === municipalityArg);
    if (toProcess.length === 0) {
      console.error(`Municipality "${municipalityArg}" not found. Run with --list to see available names.`);
      process.exit(1);
    }
  } else {
    toProcess = parsed.municipalities;
  }

  console.error(`\nField Survey Resilience Analysis — per municipality`);
  console.error(`===================================================`);
  console.error(`Source:          ${sourceFile}`);
  console.error(`Date:            ${date}`);
  console.error(`To analyse:      ${toProcess.length} municipalit${toProcess.length === 1 ? 'y' : 'ies'}`);
  console.error('');

  let completed = 0;
  let skipped   = 0;

  for (const mun of toProcess) {
    const slug     = mun.name.replace(/[/\\?%*:|"<> ]/g, '_');
    const outPath  = resolve('reports', `survey-report-${date}-${slug}`);
    const mdPath   = `${outPath}.md`;

    if (existsSync(mdPath)) {
      console.error(`  ⏭  ${mun.name} — already exists, skipping`);
      skipped++;
      continue;
    }

    console.error(`\n── ${mun.name} (${completed + skipped + 1}/${toProcess.length}) ──`);

    try {
      const assessment = await analyzeSurvey([mun], date, `${slug}.xlsx`, { onUsage });

      if (geoEnrichmentPort) {
        for (const m of assessment.municipalities) {
          m.geo = geoEnrichmentPort.resolveLocalityName(m.name, { sourceType: 'survey' });
        }
        const g = assessment.municipalities[0]?.geo;
        if (g?.kind === 'resolved') {
          console.error(
            `  Geo: entity=${g.geoEntityType} scope=${g.scopeConfidence} subregion=${g.pboSubregionId} band=${g.distanceBand} (~${g.distanceKmToNorthBorder.toFixed(1)} km) ref=${g.geoReferenceVersion} quality=${g.quality} metrics=${g.usableForMetrics} golan=${g.isGolan}`,
          );
        } else if (g) {
          console.error(`  Geo: unknown (${g.reason ?? '?'}) raw=${JSON.stringify(g.rawName ?? '')}`);
        }
      }

      writeMunicipalityReports(assessment.municipalities, date, sourceFile, 'reports', assessment.regional);

      console.error(`  ✓ Written → ${mdPath}`);
      completed++;
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
    }

    if (completed + skipped < toProcess.length) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.error(`\n═══════════════════════════════`);
  console.error(`Done. Completed: ${completed}  Skipped: ${skipped}  Failed: ${toProcess.length - completed - skipped}`);

  const { totalCostUsd, usageLog } = getTotal();
  if (usageLog.length > 0) {
    console.error('');
    printSummary();
    appendCostLog({
      script: 'analyze-survey',
      date,
      totalCostUsd,
      usageLog,
      articles: completed,
    });
  }
}
