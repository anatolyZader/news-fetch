/**
 * CLI: analyse field survey responses (Google Forms Excel) for population resilience.
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

import { parseSurveyExcel } from '../infrastructure/adapters/surveyExcelLoader.js';
import { analyzeSurvey } from '../app/surveyEvaluator.js';
import { writeMunicipalityReports } from '../app/surveyReportWriter.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';
import {
  distanceBand,
  distanceKmToNorthBorder,
  geoEntityType,
  geoReferenceVersion,
  isGolan,
  pboSubregionId,
  quality,
  scopeConfidence,
  usableForMetrics,
} from '../../../cross-cut-modules/geo/geoEnvelopeAccess.js';
import { resilienceSurveyDataDir, surveyInputDir } from '../domain/services/paths/outputDirs.js';

const SURVEY_DATA_DIR = resilienceSurveyDataDir();
const SURVEY_INPUT_DIR = surveyInputDir();

function resolveMunicipalitiesToProcess(parsed, municipalityArg) {
  if (!municipalityArg) return parsed.municipalities;
  const toProcess = parsed.municipalities.filter((m) => m.name === municipalityArg);
  if (toProcess.length === 0) {
    console.error(`Municipality "${municipalityArg}" not found. Run with --list to see available names.`);
    process.exit(1);
  }
  return toProcess;
}

function logGeoEnrichment(assessment, geoEnrichmentPort) {
  if (!geoEnrichmentPort) return;
  for (const m of assessment.municipalities) {
    m.geo = geoEnrichmentPort.resolveLocalityName(m.name, { sourceType: 'survey' });
  }
  const g = assessment.municipalities[0]?.geo;
  if (g?.kind === 'resolved') {
    const km = distanceKmToNorthBorder(g);
    console.error(
      `  Geo: entity=${geoEntityType(g)} scope=${scopeConfidence(g)} subregion=${pboSubregionId(g)} band=${distanceBand(g)} (~${Number(km).toFixed(1)} km) ref=${geoReferenceVersion(g)} quality=${quality(g)} metrics=${usableForMetrics(g)} golan=${isGolan(g)}`,
    );
  } else if (g) {
    console.error(`  Geo: unknown (${g.reason ?? '?'}) raw=${JSON.stringify(g.rawName ?? '')}`);
  }
}

/**
 * @param {object} mun
 * @param {string} date
 * @param {string} sourceFile
 * @param {Function} onUsage
 * @param {{ geoEnrichmentPort?: { resolveLocalityName: (name: string|null|undefined) => object } }} options
 */
async function processSurveyMunicipality(mun, date, sourceFile, onUsage, options) {
  const slug = mun.name.replaceAll(/[/\\?%*:|"<> ]/g, '_');
  const outPath = resolve(SURVEY_DATA_DIR, `survey-report-${date}-${slug}`);
  const mdPath = `${outPath}.md`;

  if (existsSync(mdPath)) {
    console.error(`  ⏭  ${mun.name} — already exists, skipping`);
    return { completed: 0, skipped: 1 };
  }

  console.error(`\n── ${mun.name} ──`);
  try {
    const assessment = await analyzeSurvey([mun], date, `${slug}.xlsx`, { onUsage });
    logGeoEnrichment(assessment, options.geoEnrichmentPort);
    writeMunicipalityReports(assessment.municipalities, date, sourceFile, SURVEY_DATA_DIR, assessment.regional);
    console.error(`  ✓ Written → ${mdPath}`);
    return { completed: 1, skipped: 0 };
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    return { completed: 0, skipped: 0 };
  }
}

/**
 * @param {{ geoEnrichmentPort?: { resolveLocalityName: (name: string|null|undefined) => object } }} [options]
 */
export async function runAnalyzeSurveyCli(options = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const hasFlag = (flag) => args.includes(flag);

  const responsesArg   = getArg('--responses');
  const mappingArg     = getArg('--mapping') ?? resolve(SURVEY_INPUT_DIR, 'survey-question-mapping.json');
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

  const toProcess = resolveMunicipalitiesToProcess(parsed, municipalityArg);

  console.error(`\nField Survey Resilience Analysis — per municipality`);
  console.error(`===================================================`);
  console.error(`Source:          ${sourceFile}`);
  console.error(`Date:            ${date}`);
  console.error(`To analyse:      ${toProcess.length} municipalit${toProcess.length === 1 ? 'y' : 'ies'}`);
  console.error('');

  let completed = 0;
  let skipped   = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const mun = toProcess[i];
    console.error(`\n── ${mun.name} (${i + 1}/${toProcess.length}) ──`);
    const result = await processSurveyMunicipality(mun, date, sourceFile, onUsage, options);
    completed += result.completed;
    skipped += result.skipped;
    if (i < toProcess.length - 1) {
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
