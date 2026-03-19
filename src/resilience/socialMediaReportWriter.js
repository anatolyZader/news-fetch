/**
 * Writes a per-municipality social media resilience report as Markdown + JSON.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { RESILIENCE_COMPONENTS } from './resilienceComponents.js';

const COMPONENT_MAP = Object.fromEntries(RESILIENCE_COMPONENTS.map((c) => [c.id, c]));
const CONFIDENCE_ICON = { low: '🔵', medium: '🟡', high: '🟢' };
const ICONS = {
  narrative: '📖', information_communication: '📡', lifesaving_behavior: '🛡️',
  functional_continuity: '⚙️', community_capital: '🤝', leadership: '👤',
  belonging_solidarity: '🔗', wellbeing_atrisk: '❤️',
};

function buildMarkdown(assessment, sourceFile) {
  const lines = [];

  lines.push(
    `# Population Resilience Assessment — Social Media (Facebook)`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Municipality** | ${assessment.municipality} |`,
    `| **Date** | ${assessment.date} |`,
    `| **Source** | ${sourceFile} |`,
    `| **Confidence legend** | 🟢 High &nbsp; 🟡 Medium &nbsp; 🔵 Low |`,
    ``,
    `---`,
    ``,
    `## Summary`,
    ``,
    assessment.summary ?? '',
    ``,
    `---`,
    ``,
  );

  if (!assessment.components?.length) {
    lines.push(`*No resilience evidence found in posts.*`);
    return lines.join('\n');
  }

  // Component overview table
  lines.push(
    `## Component Overview`,
    ``,
    `| Component | עברית | Confidence |`,
    `|-----------|-------|------------|`,
  );
  for (const comp of assessment.components) {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    const icon = CONFIDENCE_ICON[comp.confidence] ?? '🟡';
    lines.push(`| ${ICONS[comp.component_id] ?? '•'} ${def.name_en ?? comp.component_id} | ${def.name_he ?? ''} | ${icon} ${comp.confidence} |`);
  }
  lines.push(``, `---`, ``);

  // Per-component detail
  lines.push(`## Findings by Component`, ``);
  for (const comp of assessment.components) {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    const icon = ICONS[comp.component_id] ?? '•';
    const confIcon = CONFIDENCE_ICON[comp.confidence] ?? '🟡';

    lines.push(
      `### ${icon} ${def.name_en ?? comp.component_id}`,
      `*${def.name_he ?? ''}* &nbsp;|&nbsp; Confidence: ${confIcon} ${comp.confidence}`,
      ``,
    );

    if (comp.narrative) lines.push(comp.narrative, ``);

    if (comp.strengths?.length) {
      lines.push(`**Strengths:**`);
      comp.strengths.forEach((s) => lines.push(`- ${s}`));
      lines.push(``);
    }

    if (comp.concerns?.length) {
      lines.push(`**Concerns:**`);
      comp.concerns.forEach((s) => lines.push(`- ${s}`));
      lines.push(``);
    }

    if (comp.notable_posts?.length) {
      lines.push(`**Notable posts:**`);
      comp.notable_posts.forEach((q) => lines.push(`> ${q}`));
      lines.push(``);
    }

    lines.push(`---`, ``);
  }

  if (assessment.analyst_caveats) {
    lines.push(`## Analyst Caveats`, ``, assessment.analyst_caveats, ``);
  }

  return lines.join('\n');
}

/**
 * @param {Object} assessment  Output of analyzeMunicipalitySocialMedia()
 * @param {string} sourceFile  Basename of the JSON input
 * @param {string} outputBase  Path without extension
 * @returns {{ mdPath, jsonPath }}
 */
export function writeSocialMediaReport(assessment, sourceFile, outputBase) {
  mkdirSync(dirname(outputBase), { recursive: true });

  const mdPath   = `${outputBase}.md`;
  const jsonPath = `${outputBase}.json`;

  writeFileSync(mdPath, buildMarkdown(assessment, sourceFile), 'utf-8');
  writeFileSync(
    jsonPath,
    JSON.stringify({ assessment, source_file: sourceFile, generated_at: new Date().toISOString() }, null, 2),
    'utf-8',
  );

  return { mdPath, jsonPath };
}
