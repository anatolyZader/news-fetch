#!/usr/bin/env node
/**
 * Convert Naftali weekly questionnaire responses into resilience signal files.
 *
 * Maps severity indicators and free-text fields to behavioral signals that
 * assess-signals.js can discover and include.
 *
 * Usage:
 *   node extract-naftali-signals.js
 *
 * Output: signals/signals-naftali-{date}.json per week (uses week end-date)
 */

import { resolve } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { getNaftaliDashboardSync } from '../app/naftaliService.js';

// Map severity dimensions → resilience signal types
const SEVERITY_TO_SIGNAL = {
  financialRequests:     { pos: 'service_continuity',           neg: 'service_disruption' },
  schoolMentalHealth:    { pos: 'wellbeing_support_accessed',   neg: 'psychological_distress' },
  communityMentalHealth: { pos: 'wellbeing_support_accessed',   neg: 'psychological_distress' },
  parentalStress:        { pos: 'wellbeing_support_accessed',   neg: 'psychological_distress' },
  coupleConflicts:       { pos: 'solidarity_help_others',       neg: 'social_exclusion' },
  parentChildConflicts:  { pos: 'solidarity_help_others',       neg: 'psychological_distress' },
};

// Vulnerability counts map to wellbeing signals
const VULN_SIGNAL = { pos: 'wellbeing_support_accessed', neg: 'psychological_distress' };

// Free-text fields map to components
const FREETEXT_TO_SIGNAL = {
  volunteerInitiatives:  'community_volunteering',
  volunteerNeeds:        'dependency_on_external_aid',
  volunteerCoordination: 'community_volunteering',
  staffShortage:         'service_disruption',
  mainChallenge:         'resilience_narrative_negative',
  urgentNeeds:           'service_disruption',
};

function run() {
  const data = getNaftaliDashboardSync();
  const outDir = resolve('signals');
  mkdirSync(outDir, { recursive: true });

  let filesWritten = 0;

  for (const week of data.weeks) {
    const signals = [];
    let articleIdx = 0;
    const weekDate = week.dateTo ?? week.dateFrom;
    if (!weekDate) continue;

    const outPath = resolve(outDir, `signals-naftali-${weekDate}.json`);
    if (existsSync(outPath)) {
      console.error(`signals-naftali-${weekDate}.json  →  already exists, skipping`);
      filesWritten++;
      continue;
    }

    for (const resp of week.responses) {
      articleIdx++;

      // Severity-based signals
      for (const [key, mapping] of Object.entries(SEVERITY_TO_SIGNAL)) {
        const sev = resp.severity[key];
        if (sev === 'unknown') continue;

        const isNegative = sev === 'high' || sev === 'medium';
        const signalType = isNegative ? mapping.neg : mapping.pos;
        const sevLabel = { high: 'High', medium: 'Medium', low: 'Low', none: 'None', qualitative: 'Qualitative' }[sev] ?? sev;

        const dimensionLabels = {
          financialRequests: 'Economic hardship requests',
          schoolMentalHealth: 'School mental health referrals',
          communityMentalHealth: 'Community mental health referrals',
          parentalStress: 'Parental stress referrals',
          coupleConflicts: 'Couple conflict referrals',
          parentChildConflicts: 'Parent-child conflict referrals',
        };

        signals.push({
          article_index: articleIdx,
          article_url: null,
          signal_type: signalType,
          evidence_type: 'observational_reported_fact',
          evidence: `[${resp.municipality}] ${dimensionLabels[key]}: ${sevLabel}`,
          scope_level: 'single_case',
          article_source: `naftali-${resp.municipality}`,
          source_type: 'naftali',
        });
      }

      // Vulnerable population signals (if any non-zero)
      const totalVuln = Object.values(resp.vulnerable).reduce((s, v) => s + v, 0);
      if (totalVuln > 0) {
        const parts = Object.entries(resp.vulnerable)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => {
            const labels = {
              physicalDisability: 'Physical disability',
              mentalDisability: 'Mental disability',
              specialEducation: 'Special education',
              domesticViolence: 'Domestic violence',
              severeFinancial: 'Severe financial hardship',
              singleParent: 'Single parent',
            };
            return `${labels[k]}: ${v}`;
          })
          .join(', ');

        signals.push({
          article_index: articleIdx,
          article_url: null,
          signal_type: VULN_SIGNAL.neg,
          evidence_type: 'observational_reported_fact',
          evidence: `[${resp.municipality}] Vulnerable populations: ${parts} (total: ${totalVuln})`,
          scope_level: 'quantified_or_broad',
          article_source: `naftali-${resp.municipality}`,
          source_type: 'naftali',
        });
      }

      // Free-text signals
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
          source_type: 'naftali',
        });
      }
    }

    writeFileSync(outPath, JSON.stringify({
      source_type: 'naftali',
      content_kind: 'naftali_questionnaire',
      geographic_scope: 'Naftali sub-region only (1 of 5 northern Israel sub-regions)',
      date: weekDate,
      week: week.week,
      extracted_at: new Date().toISOString(),
      source_files: [week.file],
      total_articles: week.responses.length,
      signals,
    }, null, 2), 'utf-8');

    console.error(`signals-naftali-${weekDate}.json  →  ${signals.length} signals from ${week.responses.length} municipalities`);
    filesWritten++;
  }

  if (filesWritten === 0) {
    console.error('No Naftali Excel files found');
  }
}

run();
