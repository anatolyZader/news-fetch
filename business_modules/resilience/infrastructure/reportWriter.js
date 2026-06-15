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

/** Pattern matching stray "N/10" scores that the LLM may leak despite prompt prohibitions. */
const SCORE_LEAK_PATTERN = /\b(10|[1-9])\s*\/\s*10\b/gi;

/**
 * Strip stray `N/10` numeric score leaks from a narrative text string.
 * Logs a warning to stderr for each occurrence found.
 * @param {string | null | undefined} text
 * @param {string} [fieldLabel]  Used in warning messages.
 * @returns {string}
 */
export function sanitizeNarrativeText(text, fieldLabel = 'narrative') {
  if (!text || typeof text !== 'string') return text ?? '';
  const matches = text.match(SCORE_LEAK_PATTERN);
  if (!matches) return text;
  console.error(
    `  ⚠ Score leak detected in ${fieldLabel}: found ${matches.length} occurrence(s) of N/10 pattern — stripping`,
  );
  return text.replace(SCORE_LEAK_PATTERN, '[score redacted]');
}

/**
 * Sanitize all operator-visible narrative fields in the assessment in-place.
 * @param {object} assessment
 */
function sanitizeAssessmentNarratives(assessment) {
  if (!assessment || typeof assessment !== 'object') return;
  if (typeof assessment.cross_component_synthesis === 'string') {
    assessment.cross_component_synthesis = sanitizeNarrativeText(
      assessment.cross_component_synthesis,
      'cross_component_synthesis',
    );
  }
  for (const comp of assessment.components ?? []) {
    if (typeof comp.narrative === 'string') {
      comp.narrative = sanitizeNarrativeText(comp.narrative, `${comp.component_id}.narrative`);
    }
    if (typeof comp.evidence_summary === 'string') {
      comp.evidence_summary = sanitizeNarrativeText(comp.evidence_summary, `${comp.component_id}.evidence_summary`);
    }
  }
}

/**
 * Write both .md and .json outputs.
 *
 * @param {Object} assessment    Assessment payload (agent v2 or degrade ladder)
 * @param {Array}  signals       Output of extractSignals()
 * @param {Array}  sourceFiles   Array of source file basenames
 * @param {string} outputBase    Path without extension
 * @param {Object} [extras]
 * @param {Object} [extras.scoreBySource]  Per-source component scores: { news: {...}, radio: {...}, field: {...} }
 * @returns {{ mdPath, jsonPath }}
 */
export function writeReport(assessment, signals, sourceFiles, outputBase, { scoreBySource } = {}) {
  sanitizeAssessmentNarratives(assessment);
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
