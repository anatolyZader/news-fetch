#!/usr/bin/env node
/**
 * Convert Naftali weekly questionnaire responses into resilience signal files.
 *
 * Maps severity indicators and free-text fields to behavioral signals that
 * assess-signals.js can discover and include.
 *
 * Usage:
 *   node business_modules/pool/input/extract-naftali-signals.js
 *
 * Output: business_modules/signals_extraction/data/signals/signals-naftali-{date}.json per week (uses week end-date)
 */

import { resolve, dirname } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getNaftaliDashboardSync } from '../app/naftaliService.js';
import { enrichSignalsWithGeo } from '../../../cross-cut-modules/geo/enrichSignalsWithGeo.js';
import { createSourceArchive } from '../../../db/source_archive/createSourceArchive.js';
import {
  archiveNaftaliWeek,
  stampNaftaliSignalSourceIds,
} from '../../../db/source_archive/archiveNaftaliWeek.js';
import { defaultClosedSignalsDir } from '../../signals_extraction/index.js';
import { naftaliWeekToExtractUnits } from '../app/naftaliDashboardToExtractUnits.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const SEVERITY_TO_SIGNAL = {
  financialRequests:     { pos: 'service_continuity',           neg: 'service_disruption' },
  schoolMentalHealth:    { pos: 'wellbeing_support_accessed',   neg: 'psychological_distress' },
  communityMentalHealth: { pos: 'wellbeing_support_accessed',   neg: 'psychological_distress' },
  parentalStress:        { pos: 'wellbeing_support_accessed',   neg: 'psychological_distress' },
  coupleConflicts:       { pos: 'solidarity_help_others',       neg: 'social_exclusion' },
  parentChildConflicts:  { pos: 'solidarity_help_others',       neg: 'psychological_distress' },
};

const VULN_SIGNAL = { pos: 'wellbeing_support_accessed', neg: 'psychological_distress' };

const FREETEXT_TO_SIGNAL = {
  volunteerInitiatives:  'community_volunteering',
  volunteerNeeds:        'dependency_on_external_aid',
  volunteerCoordination: 'community_volunteering',
  staffShortage:         'service_disruption',
  mainChallenge:         'resilience_narrative_negative',
  urgentNeeds:           'service_disruption',
};

const DIMENSION_LABELS = {
  financialRequests: 'Economic hardship requests',
  schoolMentalHealth: 'School mental health referrals',
  communityMentalHealth: 'Community mental health referrals',
  parentalStress: 'Parental stress referrals',
  coupleConflicts: 'Couple conflict referrals',
  parentChildConflicts: 'Parent-child conflict referrals',
};

const VULN_LABELS = {
  physicalDisability: 'Physical disability',
  mentalDisability: 'Mental disability',
  specialEducation: 'Special education',
  domesticViolence: 'Domestic violence',
  severeFinancial: 'Severe financial hardship',
  singleParent: 'Single parent',
};

function pushSeveritySignals(signals, resp, articleIdx) {
  for (const [key, mapping] of Object.entries(SEVERITY_TO_SIGNAL)) {
    const sev = resp.severity[key];
    if (sev === 'unknown') continue;

    const isNegative = sev === 'high' || sev === 'medium';
    const signalType = isNegative ? mapping.neg : mapping.pos;
    const sevLabel = { high: 'High', medium: 'Medium', low: 'Low', none: 'None', qualitative: 'Qualitative' }[sev] ?? sev;

    signals.push({
      article_index: articleIdx,
      article_url: null,
      signal_type: signalType,
      evidence_type: 'observational_reported_fact',
      evidence: `[${resp.municipality}] ${DIMENSION_LABELS[key]}: ${sevLabel}`,
      scope_level: 'single_case',
      article_source: `naftali-${resp.municipality}`,
      municipality: resp.municipality,
      source_type: 'naftali',
    });
  }
}

function pushVulnerabilitySignals(signals, resp, articleIdx) {
  const totalVuln = Object.values(resp.vulnerable).reduce((s, v) => s + v, 0);
  if (totalVuln <= 0) return;

  const parts = Object.entries(resp.vulnerable)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${VULN_LABELS[k]}: ${v}`)
    .join(', ');

  signals.push({
    article_index: articleIdx,
    article_url: null,
    signal_type: VULN_SIGNAL.neg,
    evidence_type: 'observational_reported_fact',
    evidence: `[${resp.municipality}] Vulnerable populations: ${parts} (total: ${totalVuln})`,
    scope_level: 'quantified_or_broad',
    article_source: `naftali-${resp.municipality}`,
    municipality: resp.municipality,
    source_type: 'naftali',
  });
}

function pushFreeTextSignals(signals, resp, articleIdx) {
  for (const [key, signalType] of Object.entries(FREETEXT_TO_SIGNAL)) {
    const text = resp.freeText[key];
    if (!text) continue;

    signals.push({
      article_index: articleIdx,
      article_url: null,
      signal_type: signalType,
      evidence_type: 'observational_reported_fact',
      evidence: `[${resp.municipality}] ${text}`,
      scope_level: 'single_case',
      article_source: `naftali-${resp.municipality}`,
      municipality: resp.municipality,
      source_type: 'naftali',
    });
  }
}

function buildSignalsForWeek(week) {
  const signals = [];
  let articleIdx = 0;

  for (const resp of week.responses) {
    articleIdx++;
    pushSeveritySignals(signals, resp, articleIdx);
    pushVulnerabilitySignals(signals, resp, articleIdx);
    pushFreeTextSignals(signals, resp, articleIdx);
  }

  return signals;
}

async function writeWeekBundle(week, outDir) {
  const weekDate = week.dateTo ?? week.dateFrom;
  if (!weekDate) return false;

  const outPath = resolve(outDir, `signals-naftali-${weekDate}.json`);
  if (existsSync(outPath)) {
    console.error(`signals-naftali-${weekDate}.json  →  already exists, skipping`);
    return true;
  }

  const signals = buildSignalsForWeek(week);
  let stampedSignals = signals;

  try {
    const sqlitePath = process.env.SQLITE_PATH?.trim()
      ? resolve(process.env.SQLITE_PATH.trim())
      : resolve(REPO_ROOT, 'db', 'app.sqlite');
    const archive = createSourceArchive(sqlitePath);
    const { archived, responseMap } = archiveNaftaliWeek(archive, week);
    archive.close();
    stampedSignals = stampNaftaliSignalSourceIds(signals, responseMap);
    if (archived > 0) console.error(`  → ${archived} Naftali original(s) archived`);
  } catch (err) {
    console.error(`  ⚠ Naftali archive skipped: ${err.message}`);
  }

  const { signals: geoSignals, resolved, unknown } = enrichSignalsWithGeo(stampedSignals, {
    rootDir: REPO_ROOT,
    unknownSourceType: 'extract-naftali',
  });
  const districtId = 'north';
  const stampedGeoSignals = geoSignals.map((s) => ({ ...s, district_id: districtId }));

  writeFileSync(outPath, JSON.stringify({
    source_type: 'naftali',
    content_kind: 'naftali_questionnaire',
    district_id: districtId,
    geographic_scope: 'Naftali sub-region only (1 of 5 northern Israel sub-regions)',
    date: weekDate,
    week: week.week,
    extracted_at: new Date().toISOString(),
    source_files: [week.file],
    total_articles: week.responses.length,
    signals: stampedGeoSignals,
  }, null, 2), 'utf-8');

  console.error(`signals-naftali-${weekDate}.json  →  ${stampedGeoSignals.length} signals from ${week.responses.length} municipalities (geo: ${resolved} resolved, ${unknown} unknown)`);

  try {
    const units = naftaliWeekToExtractUnits(week);
    if (units.length > 0) {
      const { runPipelineOpenExtract } = await import('../../signals_extraction/index.js');
      await runPipelineOpenExtract({
        articles: units,
        sourceType: 'naftali',
        contentKind: 'naftali_questionnaire',
        date: weekDate,
        sourceFiles: [week.file],
      });
    }
  } catch (err) {
    console.error(`  ⚠ Open pipeline extract skipped: ${err.message}`);
  }

  return true;
}

async function run() {
  const data = getNaftaliDashboardSync();
  const outDir = defaultClosedSignalsDir();
  mkdirSync(outDir, { recursive: true });

  let filesWritten = 0;

  for (const week of data.weeks) {
    if (await writeWeekBundle(week, outDir)) filesWritten++;
  }

  if (filesWritten === 0) {
    console.error('No Naftali Excel files found');
  }
}

run().catch((err) => {
  console.error('extract-naftali-signals failed:', err.message);
  process.exit(1);
});
