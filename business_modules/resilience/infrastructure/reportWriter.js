/**
 * Writes the resilience assessment as both a Markdown report and a JSON data file.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { collectGeoVersionsFromSignals } from '../../../cross-cut-modules/geo/signalGeoSummary.js';
import {
  appendReportHeader,
  appendMethodologyBlock,
  appendNorrisSection,
  appendComponentsTable,
  appendComponentDetails,
  appendMacroAndCaveats,
} from './reportWriterSections.js';

function evidenceDirection(pos, neg) {
  const p = Math.round((pos ?? 0) * 10) / 10;
  const n = Math.round((neg ?? 0) * 10) / 10;
  if (p === 0 && n === 0) return 'no evidence';
  let label;
  if (p > n) {
    label = 'more supporting than opposing';
  } else if (p < n) {
    label = 'more opposing than supporting';
  } else {
    label = 'evenly split';
  }
  return `${label} *(supporting: ${p}, opposing: ${n})*`;
}

function i18n(componentId) {
  const icons = {
    narrative: '📖',
    information_communication: '📡',
    lifesaving_behavior: '🛡️',
    functional_continuity: '⚙️',
    community_capital: '🤝',
    leadership: '👤',
    belonging_solidarity: '🔗',
    wellbeing_at_risk: '❤️',
  };
  return icons[componentId] ?? '•';
}

/**
 * @param {object} assessment
 * @param {string[]} sourceFiles
 * @param {{ includeScores?: boolean }} [opts] When false, narrative-focused brief (no /10).
 */
export function buildMarkdown(assessment, sourceFiles, { includeScores = true } = {}) {
  const lines = [];
  const formatters = { evidenceDirection, i18n };

  appendReportHeader(lines, assessment, sourceFiles);
  appendMethodologyBlock(lines, assessment, includeScores);
  lines.push(`## Executive Summary`, ``, assessment.cross_component_synthesis, ``, `---`, ``);
  appendNorrisSection(lines, assessment, includeScores);
  appendComponentsTable(lines, assessment, includeScores);
  appendComponentDetails(lines, assessment, includeScores, formatters);
  appendMacroAndCaveats(lines, assessment);

  return lines.join('\n');
}

/**
 * Append a signal-level appendix with article links.
 */
export function buildSignalAppendix(signals) {
  if (!signals?.length) return '';

  const lines = [``, `---`, ``, `## Signal Evidence (with article links)`, ``];

  const byType = {};
  for (const s of signals) {
    if (!byType[s.signal_type]) byType[s.signal_type] = [];
    byType[s.signal_type].push(s);
  }

  const sortedTypes = Object.entries(byType).sort(([a], [b]) => a.localeCompare(b));
  for (const [type, items] of sortedTypes) {
    lines.push(`### \`${type}\` (${items.length})`);
    for (const s of items) {
      const url = s.article_url && s.article_url !== '(no url)' && s.article_url !== 'null'
        ? ` — [source](${s.article_url})`
        : '';
      lines.push(`- "${s.evidence}"${url}`);
    }
    lines.push(``);
  }

  return lines.join('\n');
}

/**
 * Write both .md and .json outputs.
 *
 * @param {Object} assessment    Output of generateNarratives()
 * @param {Array}  signals       Output of extractSignals()
 * @param {Array}  sourceFiles   Array of source file basenames
 * @param {string} outputBase    Path without extension
 * @param {Object} [extras]
 * @param {Object} [extras.scoreBySource]  Per-source component scores: { news: {...}, radio: {...}, field: {...} }
 * @returns {{ mdPath, jsonPath }}
 */
export function writeReport(assessment, signals, sourceFiles, outputBase, { scoreBySource } = {}) {
  mkdirSync(dirname(outputBase), { recursive: true });

  const mdPath = `${outputBase}.md`;
  const briefMdPath = `${outputBase}-brief.md`;
  const jsonPath = `${outputBase}.json`;

  const appendix = buildSignalAppendix(signals);
  const md = buildMarkdown(assessment, sourceFiles, { includeScores: true }) + appendix;
  const briefMd = buildMarkdown(assessment, sourceFiles, { includeScores: false }) + appendix;
  writeFileSync(mdPath, md, 'utf-8');
  writeFileSync(briefMdPath, briefMd, 'utf-8');

  const jsonPayload = {
    assessment,
    signals,
    source_files: sourceFiles,
    generated_at: new Date().toISOString(),
    ...collectGeoVersionsFromSignals(signals),
  };
  if (scoreBySource && Object.keys(scoreBySource).length > 0) {
    jsonPayload.score_by_source = scoreBySource;
  }
  writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf-8');

  return { mdPath, briefMdPath, jsonPath };
}
