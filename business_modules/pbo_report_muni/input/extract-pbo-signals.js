#!/usr/bin/env node
/**
 * Convert PBO municipality Excel reports into resilience signal files.
 *
 * Unlike other sources (news, radio, field), PBO data is already structured
 * as scored evidence per component. We convert each municipality's scores
 * and free-text fields into behavioral signals that assess-signals.js can
 * discover and include.
 *
 * Usage:
 *   node extract-pbo-signals.js [--date YYYY-MM-DD] [--district north|south|…] [--all-districts] [--force]
 *
 * If --date is omitted, processes all available Excel files for the district(s).
 * Output: signals/signals-pbo-{date}.json (north) or signals/signals-pbo-{district}-{date}.json
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { getMunicipalityDashboard } from '../app/pboMunicipalityService.js';
import { enrichSignalsWithGeo } from '../../../cross-cut-modules/geo/enrichSignalsWithGeo.js';
import { listPboDistrictIds } from '../../../cross-cut-modules/pbo/pboDistrictRegistry.js';
import { loadReviewMetadataMapForDate, shouldForcePboSignalRewrite } from '../../pbo_report_review/input/createPboReviewWiring.js';
import { createSourceArchive } from '../../../db/source_archive/createSourceArchive.js';
import {
  archivePboMunicipalityDay,
  stampPboSignalSourceIds,
} from '../../../db/source_archive/archivePboMunicipality.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SQLITE_PATH = process.env.SQLITE_PATH?.trim()
  ? resolve(process.env.SQLITE_PATH.trim())
  : resolve(REPO_ROOT, 'db', 'app.sqlite');

const COMPONENT_TO_SIGNAL_TYPE = {
  narrative:                 'resilience_narrative_positive',
  information_communication: 'information_actionable_effective',
  lifesaving_behavior:       'compliance_enter_shelter',
  functional_continuity:     'service_continuity',
  community_capital:         'community_volunteering',
  leadership:                'leadership_visible_present',
  belonging_solidarity:      'solidarity_help_others',
  wellbeing_at_risk:          'wellbeing_support_accessed',
};

const COMPONENT_TO_NEG_SIGNAL = {
  narrative:                 'resilience_narrative_negative',
  information_communication: 'information_confusion',
  lifesaving_behavior:       'non_compliance',
  functional_continuity:     'service_disruption',
  community_capital:         'dependency_on_external_aid',
  leadership:                'leadership_absent_criticized',
  belonging_solidarity:      'social_exclusion',
  wellbeing_at_risk:          'psychological_distress',
};

function buildPboComponentSignal(muni, cid, c, articleIdx, componentNames, meta, supplemental) {
  const isPositive = c.avg >= 0.5;
  const signalType = isPositive ? COMPONENT_TO_SIGNAL_TYPE[cid] : COMPONENT_TO_NEG_SIGNAL[cid];
  const scoreParts = c.scores.map((s) => Math.round(s.value * 100) + '%').join(', ');
  const textParts = c.texts.filter(Boolean).join(' | ');
  const supplement = String(supplemental[cid] ?? '').trim();
  let evidence = `[${muni.name}] ${componentNames.he[cid]}: avg=${Math.round(c.avg * 100)}% (${scoreParts})`;
  if (textParts) evidence += ` — ${textParts}`;
  if (supplement) evidence += ` — [PBO follow-up] ${supplement}`;
  return {
    article_index: articleIdx,
    article_url: null,
    signal_type: signalType,
    evidence_type: 'observational_reported_fact',
    evidence,
    scope_level: c.scores.length >= 3 ? 'quantified_or_broad' : 'single_case',
    article_source: `pbo-${muni.name}`,
    municipality: muni.name,
    source_type: 'pbo',
    pbo_completeness: meta.pbo_completeness,
    pbo_review_status: meta.pbo_review_status,
    pbo_evidence_thin: meta.pbo_evidence_thin,
  };
}

function buildSignalsForDay(day, componentsOrder, componentNames, reviewMetaByMuni) {
  const signals = [];
  let articleIdx = 0;

  for (const muni of day.municipalities) {
    articleIdx++;
    const meta = reviewMetaByMuni.get(muni.name) ?? {
      pbo_completeness: 'incomplete',
      pbo_review_status: 'open',
      pbo_evidence_thin: true,
      supplementalTexts: {},
    };
    const supplemental = meta.supplementalTexts ?? {};

    for (const cid of componentsOrder) {
      const c = muni.components[cid];
      if (c.avg == null) continue;
      signals.push(buildPboComponentSignal(muni, cid, c, articleIdx, componentNames, meta, supplemental));
    }
  }

  return signals;
}

function outputFileName(districtId, date) {
  return districtId === 'north'
    ? `signals-pbo-${date}.json`
    : `signals-pbo-${districtId}-${date}.json`;
}

async function writeDayBundle(day, districtId, outDir, componentsOrder, componentNames, { force = false } = {}) {
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
  let signals = buildSignalsForDay(day, componentsOrder, componentNames, reviewMetaByMuni);

  try {
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
    signals = stampPboSignalSourceIds(signals, muniMap);
    if (archived > 0) console.error(`  → ${archived} PBO municipality original(s) archived`);
  } catch (err) {
    console.error(`  ⚠ PBO archive skipped: ${err.message}`);
  }

  const { signals: geoSignals, resolved, unknown } = enrichSignalsWithGeo(signals, {
    rootDir: REPO_ROOT,
    unknownSourceType: 'extract-pbo',
  });
  const stampedSignals = geoSignals.map((s) => ({ ...s, district_id: districtId }));

  writeFileSync(outPath, JSON.stringify({
    source_type: 'pbo',
    content_kind: 'pbo_municipality',
    district_id: districtId,
    date: day.date,
    extracted_at: new Date().toISOString(),
    source_files: [day.file],
    total_articles: day.municipalities.length,
    signals: stampedSignals,
  }, null, 2), 'utf-8');

  console.error(`${outputFileName(districtId, day.date)}  →  ${stampedSignals.length} signals from ${day.municipalities.length} municipalities (geo: ${resolved} resolved, ${unknown} unknown)`);
  return true;
}

async function runDistrict(districtId, filterDate, outDir, force) {
  const data = getMunicipalityDashboard(districtId, { rootDir: REPO_ROOT });
  let filesWritten = 0;

  for (const day of data.days) {
    if (filterDate && day.date !== filterDate) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await writeDayBundle(day, data.districtId, outDir, data.componentsOrder, data.componentNames, { force })) {
      filesWritten += 1;
    }
  }

  if (filesWritten === 0) {
    console.error(filterDate
      ? `No PBO data found for district=${data.districtId} date=${filterDate}`
      : `No PBO Excel files found for district=${data.districtId}`);
  }
}

async function run() {
  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const filterDate = getArg('--date');
  const allDistricts = args.includes('--all-districts');
  const districtArg = getArg('--district') ?? 'north';
  const force = args.includes('--force');

  const outDir = resolve('signals');
  mkdirSync(outDir, { recursive: true });

  const districts = allDistricts ? listPboDistrictIds() : [districtArg];
  for (const districtId of districts) {
    // eslint-disable-next-line no-await-in-loop
    await runDistrict(districtId, filterDate, outDir, force);
  }
}

void run();
