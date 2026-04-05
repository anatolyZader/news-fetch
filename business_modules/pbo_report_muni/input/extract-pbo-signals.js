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
 *   node extract-pbo-signals.js [--date YYYY-MM-DD]
 *
 * If --date is omitted, processes all available Excel files.
 * Output: signals/signals-pbo-{date}.json per file
 */

import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { getMunicipalityDashboard } from '../app/pboMunicipalityService.js';

const COMPONENT_TO_SIGNAL_TYPE = {
  narrative:                 'resilience_narrative_positive',
  information_communication: 'information_actionable_effective',
  lifesaving_behavior:       'compliance_enter_shelter',
  functional_continuity:     'service_continuity',
  community_capital:         'community_volunteering',
  leadership:                'leadership_visible_present',
  belonging_solidarity:      'solidarity_help_others',
  wellbeing_atrisk:          'wellbeing_support_accessed',
};

const COMPONENT_TO_NEG_SIGNAL = {
  narrative:                 'resilience_narrative_negative',
  information_communication: 'information_confusion',
  lifesaving_behavior:       'non_compliance',
  functional_continuity:     'service_disruption',
  community_capital:         'dependency_on_external_aid',
  leadership:                'leadership_absent_criticized',
  belonging_solidarity:      'social_exclusion',
  wellbeing_atrisk:          'psychological_distress',
};

function run() {
  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const filterDate = getArg('--date');

  const data = getMunicipalityDashboard();
  const outDir = resolve('signals');
  mkdirSync(outDir, { recursive: true });

  let filesWritten = 0;

  for (const day of data.days) {
    if (filterDate && day.date !== filterDate) continue;

    const signals = [];
    let articleIdx = 0;

    for (const muni of day.municipalities) {
      articleIdx++;
      for (const cid of data.componentsOrder) {
        const c = muni.components[cid];
        if (c.avg == null) continue;

        // Determine polarity: >=0.5 is positive, <0.5 is negative
        const isPositive = c.avg >= 0.5;
        const signalType = isPositive ? COMPONENT_TO_SIGNAL_TYPE[cid] : COMPONENT_TO_NEG_SIGNAL[cid];

        // Build evidence string from scores + text
        const scoreParts = c.scores.map((s) => Math.round(s.value * 100) + '%').join(', ');
        const textParts = c.texts.filter(Boolean).join(' | ');
        const evidence = `[${muni.name}] ${data.componentNames.he[cid]}: avg=${Math.round(c.avg * 100)}% (${scoreParts})${textParts ? ' — ' + textParts : ''}`;

        // Scope: quantified if many scores, single_case otherwise
        const scope = c.scores.length >= 3 ? 'quantified_or_broad' : 'single_case';

        signals.push({
          article_index: articleIdx,
          article_url: null,
          signal_type: signalType,
          evidence_type: 'observational_reported_fact',
          evidence,
          scope_level: scope,
          article_source: `pbo-${muni.name}`,
          source_type: 'pbo',
        });
      }
    }

    const outPath = resolve(outDir, `signals-pbo-${day.date}.json`);
    writeFileSync(outPath, JSON.stringify({
      source_type: 'pbo',
      content_kind: 'pbo_municipality',
      date: day.date,
      extracted_at: new Date().toISOString(),
      source_files: [day.file],
      total_articles: day.municipalities.length,
      signals,
    }, null, 2), 'utf-8');

    console.error(`signals-pbo-${day.date}.json  →  ${signals.length} signals from ${day.municipalities.length} municipalities`);
    filesWritten++;
  }

  if (filesWritten === 0) {
    console.error(filterDate
      ? `No PBO data found for ${filterDate}`
      : 'No PBO Excel files found');
  }
}

run();
