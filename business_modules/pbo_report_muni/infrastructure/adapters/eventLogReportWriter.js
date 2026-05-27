/**
 * Writes PBO event log resilience assessment as Markdown + JSON.
 * Parallel to reportWriter.js but adapted for event log fields.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { RESILIENCE_COMPONENTS } from '../../../resilience/domain/resilienceComponents.js';

const COMPONENT_MAP = Object.fromEntries(RESILIENCE_COMPONENTS.map((c) => [c.id, c]));

const SCORE_LABEL = (s) => {
  if (s <= 2) return '🔴 Critical';
  if (s <= 4) return '🟠 Weak';
  if (s <= 6) return '🟡 Moderate';
  if (s <= 8) return '🟢 Good';
  return '🟢 Strong';
};

const TREND_ICON = { improving: '📈', stable: '➡️', degrading: '📉', unclear: '❔' };

const ICONS = {
  narrative: '📖',
  information_communication: '📡',
  lifesaving_behavior: '🛡️',
  functional_continuity: '⚙️',
  community_capital: '🤝',
  leadership: '👤',
  belonging_solidarity: '🔗',
  wellbeing_at_risk: '❤️',
};

function buildMarkdown(assessment, parsedLog, sourceFile) {
  const lines = [];

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push(
    `# Population Resilience Assessment — PBO Event Log`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Log** | ${parsedLog.title} |`,
    `| **Date** | ${assessment.date} |`,
    `| **Source file** | ${sourceFile} |`,
    `| **Events analyzed** | ${assessment.total_events_analyzed} |`,
    `| **Overall score** | **${assessment.overall_resilience_score}/10** — ${SCORE_LABEL(assessment.overall_resilience_score)} |`,
    ``,
    `---`,
    ``,
  );

  // ── Incident summary ───────────────────────────────────────────────────────
  lines.push(`## Incident Summary`, ``, assessment.incident_summary, ``, `---`, ``);

  // ── Cross-component synthesis ──────────────────────────────────────────────
  lines.push(`## Executive Synthesis`, ``, assessment.cross_component_synthesis, ``, `---`, ``);

  // ── Score table ────────────────────────────────────────────────────────────
  lines.push(
    `## Component Scores`,
    ``,
    `| # | Component | עברית | Score | Status | Confidence | Trend |`,
    `|---|-----------|-------|-------|--------|------------|-------|`,
  );
  (assessment.components ?? []).forEach((comp, i) => {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    const trend = TREND_ICON[comp.temporal_trend] ?? '❔';
    lines.push(
      `| ${i + 1} | ${def.name_en ?? comp.component_id} | ${def.name_he ?? ''} | ${comp.score}/10 | ${SCORE_LABEL(comp.score)} | ${comp.confidence} | ${trend} ${comp.temporal_trend ?? ''} |`,
    );
  });
  lines.push(``, `---`, ``);

  // ── Per-component detail ───────────────────────────────────────────────────
  lines.push(`## Detailed Analysis`, ``);

  for (const comp of assessment.components ?? []) {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    const icon = ICONS[comp.component_id] ?? '•';
    const trend = TREND_ICON[comp.temporal_trend] ?? '❔';

    lines.push(
      `### ${icon} ${def.name_en ?? comp.component_id}`,
      `*${def.name_he ?? ''}*`,
      ``,
      `**Score:** ${comp.score}/10 — ${SCORE_LABEL(comp.score)} &nbsp;|&nbsp; **Confidence:** ${comp.confidence} &nbsp;|&nbsp; **Trend:** ${trend} ${comp.temporal_trend ?? ''}`,
      ``,
      comp.narrative,
      ``,
    );

    if (comp.key_positive_behaviors?.length) {
      lines.push(`**Positive behavioral signals:**`);
      comp.key_positive_behaviors.forEach((b) => lines.push(`- ${b}`));
      lines.push(``);
    }

    if (comp.key_negative_behaviors?.length) {
      lines.push(`**Negative behavioral signals:**`);
      comp.key_negative_behaviors.forEach((b) => lines.push(`- ${b}`));
      lines.push(``);
    }

    if (comp.missing_observations) {
      lines.push(`**Observation gaps:** ${comp.missing_observations}`, ``);
    }

    lines.push(`---`, ``);
  }

  // ── Caveats ────────────────────────────────────────────────────────────────
  lines.push(`## Analyst Caveats`, ``, assessment.analyst_caveats, ``);

  return lines.join('\n');
}

/**
 * @param {Object} assessment       Output of synthesizeFromEvents()
 * @param {Array}  classifications  Output of classifyEvents()
 * @param {Object} parsedLog        Output of parseEventLog()
 * @param {string} sourceFile       Basename of the input file
 * @param {string} outputBase       Path without extension
 * @returns {{ mdPath, jsonPath }}
 */
export function writeEventReport(assessment, classifications, parsedLog, sourceFile, outputBase) {
  mkdirSync(dirname(outputBase), { recursive: true });

  const mdPath = `${outputBase}.md`;
  const jsonPath = `${outputBase}.json`;

  writeFileSync(mdPath, buildMarkdown(assessment, parsedLog, sourceFile), 'utf-8');

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        assessment,
        event_classifications: classifications,
        source_file: sourceFile,
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf-8',
  );

  return { mdPath, jsonPath };
}
