/**
 * Writes the resilience assessment as both a Markdown report and a JSON data file.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import { summarizeConfidence } from '../domain/services/behaviorSignals.js';
import {
  COMPONENTS_TABLE_HELP_MARKDOWN,
  EVIDENCE_LEVEL_INLINE_NOTE,
} from '../../../shared/componentsTableGlossary.js';

const COMPONENT_MAP = Object.fromEntries(RESILIENCE_COMPONENTS.map((c) => [c.id, c]));

function evidenceDirection(pos, neg) {
  const p = Math.round((pos ?? 0) * 10) / 10;
  const n = Math.round((neg ?? 0) * 10) / 10;
  if (p === 0 && n === 0) return 'no evidence';
  const label = p > n ? 'more supporting than opposing' : p < n ? 'more opposing than supporting' : 'evenly split';
  return `${label} *(supporting: ${p}, opposing: ${n})*`;
}

function buildMarkdown(assessment, sourceFiles) {
  const lines = [];

  // ── Header ────────────────────────────────────────────────────────────────
  const kind = assessment.content_kind ?? 'news';
  lines.push(
    `# Population Resilience Assessment`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Date** | ${assessment.date} |`,
    `| **Scope** | ${assessment.report_scope?.label ?? 'National'} |`,
    `| **Content kind** | ${kind} |`,
    `| **Sources** | ${sourceFiles.join(', ')} |`,
    `| **Articles analyzed** | ${assessment.total_articles_analyzed} |`,
    ``,
    `---`,
    ``,
  );

  // ── Executive summary ─────────────────────────────────────────────────────
  lines.push(`## Executive Summary`, ``, assessment.cross_component_synthesis, ``, `---`, ``);

  // ── Component overview table ───────────────────────────────────────────────
  lines.push(`## Components`, ``, COMPONENTS_TABLE_HELP_MARKDOWN, ``, `| # | Component | עברית | Assessment reliability | Evidence level | Evidence base | Article coverage |`,
    `|---|-----------|-------|------------------------|----------------|---------------|------------------|`,
  );
  (assessment.components ?? []).forEach((comp, i) => {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    const coveragePct = comp.coverage_ratio != null ? `${(comp.coverage_ratio * 100).toFixed(0)}%` : '—';
    const certPct = comp.certainty != null ? `${(comp.certainty * 100).toFixed(0)}%` : '—';
    lines.push(
      `| ${i + 1} | ${def.name_en ?? comp.component_id} | ${def.name_he ?? ''} | ${summarizeConfidence(comp.confidence)} | ${certPct} | ${comp.signal_count ?? 0} signals | ${comp.distinct_article_count ?? '—'}/${assessment.total_articles_analyzed} (${coveragePct}) |`,
    );
  });
  lines.push(``, `---`, ``);

  // ── Per-component detail ──────────────────────────────────────────────────
  lines.push(`## Detailed Analysis`, ``);

  for (const comp of assessment.components ?? []) {
    const def = COMPONENT_MAP[comp.component_id] ?? {};

    const coveragePct = comp.coverage_ratio != null ? `${(comp.coverage_ratio * 100).toFixed(1)}%` : '—';
    const articleCoverage = `${comp.distinct_article_count ?? '—'} of ${assessment.total_articles_analyzed}`;
    const certPct = comp.certainty != null ? `${(comp.certainty * 100).toFixed(0)}%` : '—';
    const spreadLabel = (comp.dispersion ?? '—').replace(/_/g, ' ');

    const scoreCi = comp.score != null && comp.score_low != null && comp.score_high != null
      ? `**Score:** ${comp.score}/10  *(90% CI: ${comp.score_low}–${comp.score_high})*`
      : (comp.score != null ? `**Score:** ${comp.score}/10` : '');

    lines.push(
      `### ${i18n(comp.component_id)} ${def.name_en ?? comp.component_id}`,
      `*${def.name_he ?? ''}*`,
      ``,
    );
    if (scoreCi) lines.push(scoreCi, ``);

    if (comp.score_smoothed != null && comp.score_smoothed !== comp.score) {
      lines.push(`**Smoothed score (EWMA):** ${comp.score_smoothed}/10`, ``);
    }
    if (comp.floor_clamped === true) {
      lines.push(`> **Note — thin evidence:** the score is constrained to [3, 8] because total evidence mass for this component was below the floor threshold. Treat the headline cautiously.`);
    }
    if (comp.ci_unstable === true) {
      lines.push(`> **Note — CI unstable:** more than 20% of bootstrap resamples produced no score; the displayed CI is a widened fallback.`);
    }

    lines.push(
      `**Assessment reliability:** ${summarizeConfidence(comp.confidence)} *(based on how much evidence was found and how broadly it appears across the sample)* | **Evidence level:** ${certPct} *(${EVIDENCE_LEVEL_INLINE_NOTE})*`,
      `**Evidence base:** ${comp.signal_count ?? 0} behavioral signals found in ${articleCoverage} articles *(${coveragePct} of today's sample, ${spreadLabel} spread across sources)* | **Evidence direction:** ${evidenceDirection(comp.positive_evidence, comp.negative_evidence)}`,
    );

    if (comp.polarization != null && comp.polarization > 0.5 && (comp.evidence_mass ?? 0) > 4) {
      lines.push(
        `> **Note — contested evidence:** positive and negative observations are split (polarization ${comp.polarization.toFixed(2)}); this score reflects an unresolved disagreement, not a single direction.`,
      );
    }

    if (comp.delta_score != null) {
      const sign = comp.delta_score > 0 ? '+' : '';
      const z = comp.delta_significance != null ? `, z=${comp.delta_significance.toFixed(2)}` : '';
      const flag = comp.delta_flag === 'significant' ? '  **(significant vs 14-day baseline)**' : '';
      lines.push(`**Δ vs prior day:** ${sign}${comp.delta_score}${z}${flag}`);
    }

    if (comp.counterfactual_delta != null && Math.abs(comp.counterfactual_delta) >= 1) {
      const cfSign = comp.counterfactual_delta > 0 ? '+' : '';
      lines.push(
        `**Sensitivity:** removing the dominant article would change this score by ${cfSign}${comp.counterfactual_delta} ` +
        `*(article: ${comp.counterfactual_article_key ?? 'n/a'})*`,
      );
    }

    if (comp.facets) {
      const facetLines = Object.entries(comp.facets)
        .map(([name, f]) => `- *${name}:* ${f.score != null ? `${f.score}/10` : '—'} (${f.signal_count ?? 0} signals)`);
      if (facetLines.length > 0) {
        lines.push(``, `**Facets:**`, ...facetLines);
      }
    }

    lines.push(``, comp.narrative, ``);

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
  const jsonPath = `${outputBase}.json`;

  const md = buildMarkdown(assessment, sourceFiles) + buildSignalAppendix(signals);
  writeFileSync(mdPath, md, 'utf-8');

  const jsonPayload = {
    assessment,
    signals,
    source_files: sourceFiles,
    generated_at: new Date().toISOString(),
  };
  if (scoreBySource && Object.keys(scoreBySource).length > 0) {
    jsonPayload.score_by_source = scoreBySource;
  }
  writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf-8');

  return { mdPath, jsonPath };
}
