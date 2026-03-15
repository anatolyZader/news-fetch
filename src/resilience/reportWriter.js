/**
 * Writes the resilience assessment as both a Markdown report and a JSON data file.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { RESILIENCE_COMPONENTS } from './resilienceComponents.js';

const SCORE_LABEL = (s) => {
  if (s <= 2) return '🔴 Critical';
  if (s <= 4) return '🟠 Weak';
  if (s <= 6) return '🟡 Moderate';
  if (s <= 8) return '🟢 Good';
  return '🟢 Strong';
};

const COMPONENT_MAP = Object.fromEntries(RESILIENCE_COMPONENTS.map((c) => [c.id, c]));

function buildMarkdown(assessment, sourceFiles) {
  const lines = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(
    `# Population Resilience Assessment`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Date** | ${assessment.date} |`,
    `| **Sources** | ${sourceFiles.join(', ')} |`,
    `| **Articles analyzed** | ${assessment.total_articles_analyzed} |`,
    `| **Overall score** | **${assessment.overall_resilience_score}/10** — ${SCORE_LABEL(assessment.overall_resilience_score)} |`,
    ``,
    `---`,
    ``,
  );

  // ── Executive summary ─────────────────────────────────────────────────────
  lines.push(`## Executive Summary`, ``, assessment.cross_component_synthesis, ``, `---`, ``);

  // ── Score table ───────────────────────────────────────────────────────────
  lines.push(
    `## Component Scores`,
    ``,
    `| # | Component | עברית | Score | Status | Confidence |`,
    `|---|-----------|-------|-------|--------|------------|`,
  );
  (assessment.components ?? []).forEach((comp, i) => {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    lines.push(
      `| ${i + 1} | ${def.name_en ?? comp.component_id} | ${def.name_he ?? ''} | ${comp.score}/10 | ${SCORE_LABEL(comp.score)} | ${comp.confidence} |`,
    );
  });
  lines.push(``, `---`, ``);

  // ── Per-component detail ──────────────────────────────────────────────────
  lines.push(`## Detailed Analysis`, ``);

  for (const comp of assessment.components ?? []) {
    const def = COMPONENT_MAP[comp.component_id] ?? {};

    lines.push(
      `### ${i18n(comp.component_id)} ${def.name_en ?? comp.component_id}`,
      `*${def.name_he ?? ''}*`,
      ``,
      `**Score:** ${comp.score}/10 — ${SCORE_LABEL(comp.score)} &nbsp;|&nbsp; **Confidence:** ${comp.confidence}`,
      ``,
      comp.narrative,
      ``,
    );

    if (comp.supporting_evidence?.length) {
      lines.push(`**Positive signals:**`);
      comp.supporting_evidence.forEach((e) => lines.push(`- ${e}`));
      lines.push(``);
    }

    if (comp.weakening_evidence?.length) {
      lines.push(`**Concerns:**`);
      comp.weakening_evidence.forEach((e) => lines.push(`- ${e}`));
      lines.push(``);
    }

    if (comp.missing_evidence) {
      lines.push(`**Evidence gaps:** ${comp.missing_evidence}`, ``);
    }

    lines.push(`---`, ``);
  }

  // ── Caveats ───────────────────────────────────────────────────────────────
  lines.push(`## Methodological Caveats`, ``, assessment.media_bias_caveats, ``);

  return lines.join('\n');
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
    wellbeing_atrisk: '❤️',
  };
  return icons[componentId] ?? '•';
}

/**
 * Write both .md and .json outputs.
 *
 * @param {Object} assessment        Output of synthesizeComponents()
 * @param {Array}  evidenceSnippets  Output of extractEvidence()
 * @param {Array}  sourceFiles       Array of source file basenames
 * @param {string} outputBase        Path without extension (e.g. "resilience/resilience-report-2026-03-14")
 * @returns {{ mdPath, jsonPath }}
 */
export function writeReport(assessment, evidenceSnippets, sourceFiles, outputBase) {
  mkdirSync(dirname(outputBase), { recursive: true });

  const mdPath = `${outputBase}.md`;
  const jsonPath = `${outputBase}.json`;

  writeFileSync(mdPath, buildMarkdown(assessment, sourceFiles), 'utf-8');

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        assessment,
        evidence_snippets: evidenceSnippets,
        source_files: sourceFiles,
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf-8',
  );

  return { mdPath, jsonPath };
}
