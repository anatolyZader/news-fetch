#!/usr/bin/env node
/**
 * Convert PBO municipality Excel reports into resilience signal files.
 *
 * Pipeline uses verbal fields only (התייחסות מילולית columns + review follow-up text).
 * Numeric officer scores are not analyzed. LLM dual-path extract produces closed
 * signals and open pipeline observations (same pattern as regional PBO).
 *
 * Usage:
 *   node extract-pbo-signals.js [--date YYYY-MM-DD] [--district north|south|…] [--all-districts] [--force]
 *
 * If --date is omitted, processes all available Excel files for the district(s).
 * Output: business_modules/signals_extraction/data/signals/signals-pbo-{date}.json (north) or signals-pbo-{district}-{date}.json
 */

import { bootstrapDefaultStateStore } from '../../../cross-cut-modules/persistence/bootstrapStateStore.js';

bootstrapDefaultStateStore();

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { archiveArtifactBeforeWrite } from '../../../cross-cut-modules/log/index.js';
import { getMunicipalityDashboard } from '../app/pboMunicipalityService.js';
import { attributeSignalScope } from '../../../cross-cut-modules/geo/attributeSignalScope.js';
import { listPboDistrictIds } from '../../../cross-cut-modules/pbo/pboDistrictRegistry.js';
import { loadReviewMetadataMapForDate, shouldForcePboSignalRewrite } from '../../pbo_report_review/index.js';
import { createSourceArchive } from '../../../db/source_archive/createSourceArchive.js';
import {
  archivePboMunicipalityDay,
  stampPboSignalSourceIds,
} from '../../../db/source_archive/archivePboMunicipality.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { defaultClosedSignalsDir } from '../../signals_extraction/index.js';
import { pboDashboardDayToExtractUnits } from '../app/pboDashboardToExtractUnits.js';
import {
  getDefaultResilienceLlmPort,
  runArticleDualPathExtract,
  stripTraceFields,
  isOpenExtractParallelEnabled,
  pipelineOpenObservationsPath,
} from '../../resilience/index.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SQLITE_PATH = process.env.SQLITE_PATH?.trim()
  ? resolve(process.env.SQLITE_PATH.trim())
  : resolve(REPO_ROOT, 'db', 'app.sqlite');

function outputFileName(districtId, date) {
  return districtId === 'north'
    ? `signals-pbo-${date}.json`
    : `signals-pbo-${districtId}-${date}.json`;
}

function writePboSignalsBundle({ outPath, districtId, day, articles, signals }) {
  const archived = archiveArtifactBeforeWrite(outPath);
  if (archived) {
    console.error(`  → Prior PBO closed bundle archived: ${archived}`);
  }

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        source_type: 'pbo',
        content_kind: 'pbo_municipality',
        district_id: districtId,
        date: day.date,
        extracted_at: new Date().toISOString(),
        source_files: [day.file],
        total_articles: articles.length,
        signals,
      },
      null,
      2,
    ),
    'utf-8',
  );
  console.error(`\nSignal file written: ${outPath}`);
}

function assertAnalysisArtifactsPersisted({ closedPath, date, rootDir }) {
  if (!existsSync(closedPath) || statSync(closedPath).size === 0) {
    throw new Error(`Closed PBO bundle not persisted: ${closedPath}`);
  }
  if (!isOpenExtractParallelEnabled()) return;
  const openPath = pipelineOpenObservationsPath('pbo', date, rootDir);
  if (!existsSync(openPath) || statSync(openPath).size === 0) {
    throw new Error(`Open PBO observations not persisted: ${openPath}`);
  }
}

async function archiveDayMunicipalities(day, districtId, componentsOrder, componentNames, reviewMetaByMuni) {
  const retrievalService = createRetrievalService({ dbPath: SQLITE_PATH });
  const archive = createSourceArchive(SQLITE_PATH);
  const { archived, muniMap } = archivePboMunicipalityDay(
    archive,
    day,
    componentsOrder,
    componentNames,
    reviewMetaByMuni,
    { districtId, sourceFile: day.file },
  );
  for (const sourceId of muniMap.values()) {
    const row = archive.getBySourceId(sourceId, { includeBody: true });
    if (row) {
      await retrievalService.indexArchiveRow({ ...row, scope_id: districtId });
    }
  }
  retrievalService.rebuildFts();
  retrievalService.close();
  archive.close();
  if (archived > 0) console.error(`  → ${archived} PBO municipality original(s) archived`);
  return muniMap;
}

async function writeDayBundle(day, districtId, outDir, componentsOrder, componentNames, { force = false, onUsage } = {}) {
  const outPath = resolve(outDir, outputFileName(districtId, day.date));
  const effectiveForce = force || shouldForcePboSignalRewrite(day.date, SQLITE_PATH);
  if (existsSync(outPath) && !effectiveForce) {
    console.error(`${outputFileName(districtId, day.date)}  →  already exists, skipping`);
    return false;
  }
  if (existsSync(outPath) && effectiveForce && !force) {
    console.error(`${outputFileName(districtId, day.date)}  →  re-extracting (replies or resolved review)`);
  }

  const reviewMetaByMuni = loadReviewMetadataMapForDate(day.date, SQLITE_PATH);
  const articles = pboDashboardDayToExtractUnits(day, componentNames, reviewMetaByMuni);
  if (articles.length === 0) {
    console.error(`  → no verbal PBO text for ${day.date}, skipping extract`);
    return false;
  }

  let muniMap = new Map();
  try {
    muniMap = await archiveDayMunicipalities(
      day,
      districtId,
      componentsOrder,
      componentNames,
      reviewMetaByMuni,
    );
  } catch (err) {
    console.error(`  ⚠ PBO archive skipped: ${err.message}`);
  }

  const llmPort = getDefaultResilienceLlmPort();
  const filePaths = [day.file];

  console.error(`\nSignal Extraction  source=pbo  kind=field_report`);
  console.error(`===================`);
  console.error(`Date: ${day.date}`);
  console.error(`File: ${day.file}`);
  console.error(`Articles loaded: ${articles.length}\n`);

  await runArticleDualPathExtract({
    repoRoot: REPO_ROOT,
    articles,
    sourceType: 'pbo',
    contentKind: 'field_report',
    date: day.date,
    filePaths,
    onUsage,
    retrievalService: null,
    closedExtractFn: async ({ articles: arts, onUsage: usageCb }) => {
      const rawSignals = await llmPort.extractSignals(arts, { onUsage: usageCb, contentKind: 'field_report' });
      let signals = rawSignals.map((s) => ({ ...s, source_type: 'pbo' }));
      signals = stampPboSignalSourceIds(signals, muniMap);

      const { signals: attributed, attached, resolved, unknown } = attributeSignalScope(signals, {
        rootDir: REPO_ROOT,
        sourceType: 'pbo',
        bundleDistrictId: districtId,
        unknownSourceType: 'extract-pbo',
      });
      signals = attributed.map(stripTraceFields);

      console.error(`\n→ ${signals.length} signals extracted`);
      if (attached > 0) {
        console.error(`  → Geo attach: ${attached} signals, ${resolved} resolved, ${unknown} unknown`);
      }

      writePboSignalsBundle({ outPath, districtId, day, articles: arts, signals });
      return { signals };
    },
  });

  assertAnalysisArtifactsPersisted({ closedPath: outPath, date: day.date, rootDir: REPO_ROOT });

  console.error(
    `${outputFileName(districtId, day.date)}  →  LLM extract from ${articles.length} municipality unit(s) with verbal text`,
  );

  return true;
}

async function runDistrict(districtId, filterDate, outDir, force, onUsage) {
  const data = getMunicipalityDashboard(districtId, { rootDir: REPO_ROOT });
  let filesWritten = 0;

  for (const day of data.days) {
    if (filterDate && day.date !== filterDate) continue;

    if (await writeDayBundle(day, data.districtId, outDir, data.componentsOrder, data.componentNames, { force, onUsage })) {
      filesWritten += 1;
    }
  }

  if (filesWritten === 0) {
    console.error(filterDate
      ? `No PBO verbal text found for district=${data.districtId} date=${filterDate}`
      : `No PBO Excel files found for district=${data.districtId}`);
  }
}

const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const filterDate = getArg('--date');
const allDistricts = args.includes('--all-districts');
const districtArg = getArg('--district') ?? 'north';
const force = args.includes('--force');

checkDailyBudget();
const { onUsage, getTotal } = createCostTracker({ label: 'extract-pbo-signals' });

const outDir = defaultClosedSignalsDir();
mkdirSync(outDir, { recursive: true });

const districts = allDistricts ? listPboDistrictIds() : [districtArg];
for (const districtId of districts) {
  await runDistrict(districtId, filterDate, outDir, force, onUsage);
}

const { totalCostUsd, usageLog } = getTotal();
if (usageLog?.length) {
  appendCostLog({
    script: 'extract-pbo-signals',
    date: filterDate ?? new Date().toISOString().slice(0, 10),
    totalCostUsd,
    usageLog,
  });
}
