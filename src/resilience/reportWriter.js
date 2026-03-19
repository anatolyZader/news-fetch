/**
 * Writes the resilience assessment as both a Markdown report and a JSON data file.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { RESILIENCE_COMPONENTS } from './resilienceComponents.js';

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
    ``,
    `---`,
    ``,
  );

  // ── Executive summary ─────────────────────────────────────────────────────
  lines.push(`## Executive Summary`, ``, assessment.cross_component_synthesis, ``, `---`, ``);

  // ── Component overview table ───────────────────────────────────────────────
  lines.push(
    `## Components`,
    ``,
    `| # | Component | עברית | Confidence | Signals |`,
    `|---|-----------|-------|------------|---------|`,
  );
  (assessment.components ?? []).forEach((comp, i) => {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    lines.push(
      `| ${i + 1} | ${def.name_en ?? comp.component_id} | ${def.name_he ?? ''} | ${comp.confidence} | ${comp.signal_count ?? 0} |`,
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
      `**Confidence:** ${comp.confidence} &nbsp;|&nbsp; **Signals:** ${comp.signal_count ?? 0}`,
      ``,
      comp.narrative,
      ``,
    );

    if (comp.evidence?.length) {
      comp.evidence.forEach((e) => lines.push(`- ${e}`));
      lines.push(``);
    }

    lines.push(`---`, ``);
  }

  // ── Evidence Quality ──────────────────────────────────────────────────────
  lines.push(`## Evidence Quality`, ``, assessment.evidence_quality_note ?? '', ``);

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
 * Append a signal-level appendix with article links.
 */
function buildSignalAppendix(signals) {
  if (!signals?.length) return '';

  const lines = [``, `---`, ``, `## Signal Evidence (with article links)`, ``];

  // Group by signal type for readability
  const byType = {};
  for (const s of signals) {
    if (!byType[s.signal_type]) byType[s.signal_type] = [];
    byType[s.signal_type].push(s);
  }

  for (const [type, items] of Object.entries(byType).sort()) {
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
 * @param {Object} assessment   Output of generateNarratives()
 * @param {Array}  signals      Output of extractSignals()
 * @param {Array}  sourceFiles  Array of source file basenames
 * @param {string} outputBase   Path without extension
 * @returns {{ mdPath, jsonPath }}
 */
export function writeReport(assessment, signals, sourceFiles, outputBase) {
  mkdirSync(dirname(outputBase), { recursive: true });

  const mdPath = `${outputBase}.md`;
  const jsonPath = `${outputBase}.json`;

  const md = buildMarkdown(assessment, sourceFiles) + buildSignalAppendix(signals);
  writeFileSync(mdPath, md, 'utf-8');

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        assessment,
        signals,
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
