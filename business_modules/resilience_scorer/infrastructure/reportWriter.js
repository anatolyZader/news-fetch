/**
 * Writes the resilience assessment as both a Markdown report and a JSON data file.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { collectGeoVersionsFromSignals } from '../../../cross-cut-modules/geo/signalGeoSummary.js';
import {
  appendReportHeader,
  appendMethodologyBlock,
  appendComponentsTable,
  appendComponentDetails,
  appendMacroAndCaveats,
} from './reportWriterSections.js';

function evidenceDirection(pos, neg) {
  const p = pos ?? 0;
  const n = neg ?? 0;
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
 * Prefer hybrid operator narrative fields for markdown output.
 * @param {object} assessment
 * @returns {object}
 */
function assessmentForMarkdown(assessment) {
  if (!assessment || typeof assessment !== 'object') return assessment;
  return {
    ...assessment,
    cross_component_synthesis:
      assessment.cross_component_synthesis_operator ?? assessment.cross_component_synthesis,
    components: (assessment.components ?? []).map((c) => ({
      ...c,
      narrative: c.narrative_operator ?? c.narrative,
      // Section writer prepends its own "- "; operator bullets already carry one.
      evidence: c.evidence_operator?.length
        ? c.evidence_operator.map((e) => String(e).replace(/^-\s+/, ''))
        : c.evidence,
    })),
  };
}

/**
 * @param {object} assessment
 * @param {string[]} sourceFiles
 */
export function buildMarkdown(assessment, sourceFiles) {
  const lines = [];
  const formatters = { evidenceDirection, i18n };
  const mdAssessment = assessmentForMarkdown(assessment);

  appendReportHeader(lines, mdAssessment, sourceFiles);
  appendMethodologyBlock(lines, mdAssessment);
  // Evidence-quality caveats (e.g. "narrative validation incomplete") must be
  // read BEFORE the polished narratives they qualify, not buried at the bottom.
  appendMacroAndCaveats(lines, mdAssessment);
  lines.push(`## Executive Summary`, ``, mdAssessment.cross_component_synthesis, ``, `---`, ``);
  appendComponentsTable(lines, mdAssessment);
  appendComponentDetails(lines, mdAssessment, formatters);

  return lines.join('\n');
}

/**
 * In-page `#evidence-…` anchor links have no targets in the exported .md (the
 * web client resolves them from JSON) — keep the label, drop the dead link.
 * @param {string} md
 * @returns {string}
 */
function stripDeadEvidenceAnchors(md) {
  return md.replaceAll(/\[([^\]]+)\]\(#evidence-[^)]+\)/g, '$1');
}

const STALE_FIELD_VISIT_DAYS = 7;

/**
 * Stamp an age label on field-visit citations older than a week, so pre-report
 * field evidence is not read as same-day observation.
 * @param {string} md
 * @param {string | undefined} reportDate YYYY-MM-DD
 * @returns {string}
 */
export function labelStaleFieldVisits(md, reportDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate ?? ''))) return md;
  const reportMs = Date.parse(reportDate);
  // APA-rendered citations: `Field visit, 17 Mar 2026` (plain) or `[Field visit](#evidence-…), 17 Mar 2026` (linked).
  return md.replaceAll(
    /Field visit(\]\([^)]+\))?, (\d{1,2} [A-Za-z]{3} \d{4})(?! —)/g,
    (match, link, visitDateLabel) => {
      const visitMs = Date.parse(visitDateLabel);
      if (!Number.isFinite(visitMs)) return match;
      const days = Math.round((reportMs - visitMs) / 86_400_000);
      return days >= STALE_FIELD_VISIT_DAYS ? `${match} — ${days} days old` : match;
    },
  );
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
  return text.replaceAll(SCORE_LEAK_PATTERN, '[score redacted]');
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
  if (typeof assessment.cross_component_synthesis_operator === 'string') {
    assessment.cross_component_synthesis_operator = sanitizeNarrativeText(
      assessment.cross_component_synthesis_operator,
      'cross_component_synthesis_operator',
    );
  }
  for (const comp of assessment.components ?? []) {
    if (typeof comp.narrative === 'string') {
      comp.narrative = sanitizeNarrativeText(comp.narrative, `${comp.component_id}.narrative`);
    }
    if (typeof comp.narrative_operator === 'string') {
      comp.narrative_operator = sanitizeNarrativeText(
        comp.narrative_operator,
        `${comp.component_id}.narrative_operator`,
      );
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
 * @param {Object} [extras.assessmentWindow]  Persisted window metadata from buildAssessmentWindowMetadata
 * @returns {{ mdPath, jsonPath }}
 */
export function writeReport(assessment, signals, sourceFiles, outputBase, { scoreBySource, assessmentWindow } = {}) {
  sanitizeAssessmentNarratives(assessment);
  mkdirSync(dirname(outputBase), { recursive: true });

  const mdPath = `${outputBase}.md`;
  const jsonPath = `${outputBase}.json`;

  const appendix = buildSignalAppendix(signals);
  const md = labelStaleFieldVisits(
    stripDeadEvidenceAnchors(buildMarkdown(assessment, sourceFiles) + appendix),
    assessment?.date,
  );
  writeFileSync(mdPath, md, 'utf-8');

  const jsonPayload = {
    assessment,
    signals,
    source_files: sourceFiles,
    generated_at: new Date().toISOString(),
    ...collectGeoVersionsFromSignals(signals),
  };
  if (assessmentWindow && typeof assessmentWindow === 'object') {
    jsonPayload.assessment_window = assessmentWindow;
  }
  if (scoreBySource && Object.keys(scoreBySource).length > 0) {
    jsonPayload.score_by_source = scoreBySource;
  }
  writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf-8');

  return { mdPath, jsonPath };
}
