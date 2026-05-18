/**
 * Writes field survey resilience assessment as Markdown + JSON.
 * Qualitative only — no numeric scores.
 *
 * Structure:
 *   1. Header
 *   2. Regional executive summary
 *   3. Regional analysis by component
 *   4. Per-municipality findings
 *   5. Analyst caveats
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';

const COMPONENT_MAP = Object.fromEntries(RESILIENCE_COMPONENTS.map((c) => [c.id, c]));

const CONFIDENCE_ICON = { low: '🔵', medium: '🟡', high: '🟢' };

const ICONS = {
  narrative: '📖',
  information_communication: '📡',
  lifesaving_behavior: '🛡️',
  functional_continuity: '⚙️',
  community_capital: '🤝',
  leadership: '👤',
  belonging_solidarity: '🔗',
  wellbeing_atrisk: '❤️',
};

function buildMarkdown(assessment, sourceFile) {
  const lines = [];
  const { regional, municipalities } = assessment;

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push(
    `# Population Resilience Assessment — Field Survey`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Date** | ${assessment.date} |`,
    `| **Source** | ${sourceFile} |`,
    `| **Municipalities surveyed** | ${assessment.total_municipalities} |`,
    `| **Confidence legend** | 🟢 High &nbsp; 🟡 Medium &nbsp; 🔵 Low |`,
    ``,
    `**Municipalities:** ${municipalities.map((m) => m.name).join(', ')}`,
    ``,
    `---`,
    ``,
  );

  // ── Regional executive summary ───────────────────────────────────────────────
  lines.push(`## Regional Executive Summary`, ``, regional.executive_summary, ``, `---`, ``);

  // ── Regional component coverage table ───────────────────────────────────────
  lines.push(
    `## Regional Analysis by Component`,
    ``,
    `| Component | עברית | Confidence | Coverage |`,
    `|-----------|-------|------------|---------|`,
  );
  for (const comp of regional.components ?? []) {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    const icon = CONFIDENCE_ICON[comp.confidence] ?? '🟡';
    const munCount = municipalities.filter((m) =>
      m.components?.some((c) => c.component_id === comp.component_id),
    ).length;
    lines.push(
      `| ${ICONS[comp.component_id] ?? '•'} ${def.name_en ?? comp.component_id} | ${def.name_he ?? ''} | ${icon} ${comp.confidence} | ${munCount}/${municipalities.length} municipalities |`,
    );
  }
  lines.push(``, `---`, ``);

  // ── Regional component detail ────────────────────────────────────────────────
  for (const comp of regional.components ?? []) {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    const icon = ICONS[comp.component_id] ?? '•';
    const confIcon = CONFIDENCE_ICON[comp.confidence] ?? '🟡';

    lines.push(
      `### ${icon} ${def.name_en ?? comp.component_id}`,
      `*${def.name_he ?? ''}* &nbsp;|&nbsp; Confidence: ${confIcon} ${comp.confidence}`,
      ``,
      comp.narrative,
      ``,
    );

    if (comp.regional_strengths?.length) {
      lines.push(`**Regional strengths:**`);
      comp.regional_strengths.forEach((s) => lines.push(`- ${s}`));
      lines.push(``);
    }

    if (comp.regional_concerns?.length) {
      lines.push(`**Regional concerns:**`);
      comp.regional_concerns.forEach((s) => lines.push(`- ${s}`));
      lines.push(``);
    }

    if (comp.inter_municipality_variation) {
      lines.push(`**Variation across municipalities:** ${comp.inter_municipality_variation}`, ``);
    }

    lines.push(`---`, ``);
  }

  // ── Per-municipality section ─────────────────────────────────────────────────
  lines.push(`## Per-Municipality Findings`, ``);

  for (const mun of municipalities ?? []) {
    lines.push(`### ${mun.name}`, ``);

    if (!mun.components?.length) {
      lines.push(`*No assessment data available.*`, ``, `---`, ``);
      continue;
    }

    // Component summary table for this municipality
    lines.push(
      `| Component | עברית | Confidence |`,
      `|-----------|-------|------------|`,
    );
    for (const comp of mun.components) {
      const def = COMPONENT_MAP[comp.component_id] ?? {};
      const confIcon = CONFIDENCE_ICON[comp.confidence] ?? '🟡';
      lines.push(`| ${ICONS[comp.component_id] ?? '•'} ${def.name_en ?? comp.component_id} | ${def.name_he ?? ''} | ${confIcon} ${comp.confidence} |`);
    }
    lines.push(``);

    // Per-component findings
    for (const comp of mun.components) {
      const def = COMPONENT_MAP[comp.component_id] ?? {};
      const icon = ICONS[comp.component_id] ?? '•';

      lines.push(`#### ${icon} ${def.name_en ?? comp.component_id}`, ``);

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
    }

    lines.push(`---`, ``);
  }

  // ── Caveats ──────────────────────────────────────────────────────────────────
  lines.push(`## Analyst Caveats`, ``, regional.analyst_caveats, ``);

  return lines.join('\n');
}

function municiaplitySlug(name) {
  return name.replace(/[/\\?%*:|"<> ]/g, '_');
}

function buildMunicipalityMarkdown(mun, date, sourceFile) {
  const lines = [];

  lines.push(
    `# Population Resilience Assessment — Field Survey`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Municipality** | ${mun.name} |`,
    `| **Date** | ${date} |`,
    `| **Source** | ${sourceFile} |`,
    `| **Confidence legend** | 🟢 High &nbsp; 🟡 Medium &nbsp; 🔵 Low |`,
    ``,
    `---`,
    ``,
  );

  if (mun.geo && typeof mun.geo === 'object') {
    lines.push(`## Geo enrichment`, ``);
    if (mun.geo.kind === 'resolved') {
      const br = mun.geo.borderReferenceVersion ?? mun.geo.audit?.borderReferenceVersion ?? 'n/a';
      const entity = mun.geo.resolution?.geoEntityType ?? mun.geo.geoEntityType;
      const semantics = mun.geo.classification?.distanceSemantics;
      lines.push(
        `*Reference version:* \`${String(mun.geo.geoReferenceVersion ?? mun.geo.audit?.geoReferenceVersion)}\` · *Border version:* \`${String(br)}\` · *Entity type:* \`${String(entity)}\` · *Scope confidence:* \`${String(mun.geo.scopeConfidence ?? mun.geo.policy?.scopeConfidence)}\` · *Quality:* \`${mun.geo.quality ?? mun.geo.policy?.quality}\` · *Usable for metrics:* ${mun.geo.usableForMetrics ?? mun.geo.policy?.usableForMetrics} · *Requires review:* ${mun.geo.requiresReview ?? mun.geo.policy?.requiresReview}`,
        ``,
      );
      if (
        semantics === 'representative_centroid_to_polyline' ||
        entity === 'regional_council' ||
        entity === 'area'
      ) {
        lines.push(
          `*Distance note:* approximate administrative centroid — not a settlement pin; use for orientation only.`,
          ``,
        );
      }
    }
    lines.push('```json', JSON.stringify(mun.geo, null, 2), '```', ``, `---`, ``);
  }

  // Component summary table
  lines.push(
    `## Component Overview`,
    ``,
    `| Component | עברית | Confidence |`,
    `|-----------|-------|------------|`,
  );
  for (const comp of mun.components ?? []) {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    const confIcon = CONFIDENCE_ICON[comp.confidence] ?? '🟡';
    lines.push(`| ${ICONS[comp.component_id] ?? '•'} ${def.name_en ?? comp.component_id} | ${def.name_he ?? ''} | ${confIcon} ${comp.confidence} |`);
  }
  lines.push(``, `---`, ``);

  // Per-component detail
  lines.push(`## Findings by Component`, ``);
  for (const comp of mun.components ?? []) {
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

    lines.push(`---`, ``);
  }

  return lines.join('\n');
}

/**
 * Write one MD file per municipality into outputDir.
 * When regional synthesis is provided (single-municipality run), it is included.
 *
 * @param {Array}  munAssessments  assessment.municipalities array
 * @param {string} date
 * @param {string} sourceFile
 * @param {string} outputDir
 * @param {Object} [regional]      Optional regional synthesis (used when mun count = 1)
 * @returns {string[]}
 */
export function writeMunicipalityReports(munAssessments, date, sourceFile, outputDir, regional) {
  mkdirSync(outputDir, { recursive: true });
  const written = [];
  for (const mun of munAssessments) {
    const slug = municiaplitySlug(mun.name);
    const mdPath = `${outputDir}/survey-report-${date}-${slug}.md`;
    // Use regional synthesis when available (single-mun run gives richest output)
    const content = regional
      ? buildMarkdown({ date, total_municipalities: 1, regional, municipalities: [mun] }, sourceFile)
      : buildMunicipalityMarkdown(mun, date, sourceFile);
    writeFileSync(mdPath, content, 'utf-8');
    written.push(mdPath);
  }
  return written;
}

/**
 * @param {Object} assessment  Output of analyzeSurvey()
 * @param {string} sourceFile  Basename of the Excel input
 * @param {string} outputBase  Path without extension
 * @returns {{ mdPath, jsonPath }}
 */
export function writeSurveyReport(assessment, sourceFile, outputBase) {
  mkdirSync(dirname(outputBase), { recursive: true });

  const mdPath = `${outputBase}.md`;
  const jsonPath = `${outputBase}.json`;

  writeFileSync(mdPath, buildMarkdown(assessment, sourceFile), 'utf-8');
  writeFileSync(
    jsonPath,
    JSON.stringify({ assessment, source_file: sourceFile, generated_at: new Date().toISOString() }, null, 2),
    'utf-8',
  );

  return { mdPath, jsonPath };
}
