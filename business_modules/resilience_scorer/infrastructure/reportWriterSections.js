/**
 * Section builders for resilience assessment Markdown reports.
 */

import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import { summarizeConfidence } from '../domain/services/behaviorSignals.js';
import {
  COMPONENTS_TABLE_HELP_MARKDOWN,
  EVIDENCE_LEVEL_INLINE_NOTE,
} from '../../../cross-cut-modules/resilience-contracts/componentsTableGlossary.js';
import {
  dashIfNull,
  formatComponentScoreLine,
  formatContributorLine,
  formatFacetLine,
  formatNorrisHeaderMetrics,
} from './reportWriterFormatters.js';

const COMPONENT_MAP = Object.fromEntries(RESILIENCE_COMPONENTS.map((c) => [c.id, c]));

function appendNorrisCapacity(lines, cap, includeScores) {
  const diag = cap.diagnostics ?? {};
  const robustness = dashIfNull(diag.robustness, (v) => v.toFixed(2));
  const redundancy = dashIfNull(diag.redundancy, (v) => v.toFixed(2));
  const rapidity = dashIfNull(diag.rapidity, (v) => v.toFixed(2));
  const headerMetrics = formatNorrisHeaderMetrics(cap, includeScores);

  lines.push(
    `### ${cap.label_en ?? cap.capacity_id}`,
    `*${cap.label_he ?? ''}*`,
    ``,
    headerMetrics,
    `**Diagnostics (4Rs indices):** robustness ${robustness}, redundancy ${redundancy}, rapidity ${rapidity}`,
  );

  if (cap.top_contributors?.length) {
    lines.push(``, `**Top contributors:**`);
    for (const t of cap.top_contributors.slice(0, 3)) {
      lines.push(formatContributorLine(t));
    }
  }

  lines.push(``, `---`, ``);
}

function appendComponentScoreNotes(lines, comp, includeScores) {
  if (includeScores) {
    const scoreCi = formatComponentScoreLine(comp);
    if (scoreCi) lines.push(scoreCi, ``);
    if (comp.score_smoothed != null && comp.score_smoothed !== comp.score) {
      lines.push(`**Smoothed score (EWMA):** ${comp.score_smoothed}/10`, ``);
    }
  }

  if (comp.floor_clamped === true) {
    const note = includeScores
      ? `> **Note — thin evidence:** the score is constrained to [3, 8] because total evidence mass for this component was below the floor threshold. Treat the headline cautiously.`
      : `> **Note — thin evidence:** evidence mass is below the floor threshold; treat this component cautiously.`;
    lines.push(note);
  }

  if (comp.salience_critical === true) {
    const bypassNote = comp.floor_bypassed === true
      ? ' The min-mass floor was bypassed for this verified high-stakes signal.'
      : '';
    lines.push(
      `> **Note — critical single signal:** one verified high-stakes report drives this component despite thin overall evidence.${bypassNote} Corroboration is still limited — treat as an early warning, not a census.`,
    );
  }

  if (includeScores && comp.ci_unstable === true) {
    lines.push(`> **Note — CI unstable:** more than 20% of bootstrap resamples produced no score; the displayed CI is a widened fallback.`);
  }
}

function appendComponentMetrics(lines, comp, assessment, includeScores, evidenceDirection) {
  const coveragePct = dashIfNull(comp.coverage_ratio, (v) => `${(v * 100).toFixed(1)}%`);
  const articleCoverage = `${comp.distinct_article_count ?? '—'} of ${assessment.total_articles_analyzed}`;
  const certPct = dashIfNull(comp.certainty, (v) => `${(v * 100).toFixed(0)}%`);
  const spreadLabel = (comp.dispersion ?? '—').replaceAll('_', ' ');
  const evidenceLevelPart = includeScores
    ? ` | **Evidence level:** ${certPct} *(${EVIDENCE_LEVEL_INLINE_NOTE})*`
    : '';

  lines.push(
    `**Assessment reliability:** ${summarizeConfidence(comp.confidence)} *(based on how much evidence was found and how broadly it appears across the sample)*${evidenceLevelPart}`,
    `**Evidence base:** ${comp.signal_count ?? 0} behavioral signals found in ${articleCoverage} articles *(${coveragePct} of today's sample, ${spreadLabel} spread across sources)* | **Evidence direction:** ${evidenceDirection(comp.positive_evidence, comp.negative_evidence)}`,
  );

  if (comp.polarization != null && comp.polarization > 0.5 && (comp.evidence_mass ?? 0) > 4) {
    const contestedNote = includeScores
      ? `> **Note — contested evidence:** positive and negative observations are split (polarization ${comp.polarization.toFixed(2)}); this score reflects an unresolved disagreement, not a single direction.`
      : `> **Note — contested evidence:** positive and negative observations are split; narrative should reflect unresolved disagreement.`;
    lines.push(contestedNote);
  }
}

function appendComponentDeltaNotes(lines, comp, includeScores) {
  if (includeScores && comp.delta_score != null) {
    const sign = comp.delta_score > 0 ? '+' : '';
    const z = comp.delta_significance == null ? '' : `, z=${comp.delta_significance.toFixed(2)}`;
    const flag = comp.delta_flag === 'significant' ? '  **(significant vs 14-day baseline)**' : '';
    lines.push(`**Δ vs prior day:** ${sign}${comp.delta_score}${z}${flag}`);
  } else if (comp.delta_flag === 'significant') {
    lines.push(`**Δ vs prior day:** significant change vs 14-day baseline *(magnitude hidden in brief)*`);
  }

  if (includeScores && comp.counterfactual_delta != null && Math.abs(comp.counterfactual_delta) >= 1) {
    const cfSign = comp.counterfactual_delta > 0 ? '+' : '';
    const articleKey = comp.counterfactual_article_key ?? 'n/a';
    lines.push(
      `**Sensitivity:** removing the dominant article would change this score by ${cfSign}${comp.counterfactual_delta} ` +
      `*(article: ${articleKey})*`,
    );
  }
}

function appendOneComponentDetail(lines, comp, assessment, includeScores, { evidenceDirection, i18n }) {
  const def = COMPONENT_MAP[comp.component_id] ?? {};

  lines.push(
    `### ${i18n(comp.component_id)} ${def.name_en ?? comp.component_id}`,
    `*${def.name_he ?? ''}*`,
    ``,
  );

  appendComponentScoreNotes(lines, comp, includeScores);
  appendComponentMetrics(lines, comp, assessment, includeScores, evidenceDirection);
  appendComponentDeltaNotes(lines, comp, includeScores);

  if (comp.facets) {
    const facetLines = Object.entries(comp.facets).map(([name, f]) => formatFacetLine(name, f, includeScores));
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

/**
 * @param {string[]} lines
 * @param {object} assessment
 * @param {string[]} sourceFiles
 */
export function appendReportHeader(lines, assessment, sourceFiles) {
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
}

/**
 * @param {string[]} lines
 * @param {object} assessment
 * @param {boolean} includeScores
 */
export function appendMethodologyBlock(lines, assessment, includeScores) {
  if (!assessment.methodology) return;

  const m = assessment.methodology;
  lines.push(
    `## Methodology (phase 1)`,
    ``,
    `**Phase:** ${m.phase ?? 'national_and_north_only'}. **Weights:** ${m.scoring?.weights ?? 'author_set'} (not crisis-fitted). **Tuning:** ${m.scoring?.tuning ?? 'heuristic'} (advisory proposals only).`,
    ``,
    m.epistemic?.reliability_instruments ?? '',
    ``,
  );

  if (!includeScores) {
    if (m.governance?.headline_scores_are) {
      lines.push(`> **Operator brief:** ${m.governance.headline_scores_are}`, ``);
    }
    if (m.norris_lens?.not_same_as) {
      lines.push(
        `> **Norris lens:** ${m.norris_lens.measures ?? ''}. Not the same as ${m.norris_lens.not_same_as}.`,
        ``,
      );
    }
  }

  const sds = m.scope?.scope_decision_summary;
  if (sds?.by_source) {
    const parts = Object.entries(sds.by_source).map(([k, n]) => `${k}: ${n}`);
    lines.push(`**Scope decisions:** ${parts.join('; ')}.`, ``);
  }
  lines.push(`---`, ``);
}

/**
 * @param {string[]} lines
 * @param {object} assessment
 * @param {boolean} includeScores
 */
export function appendNorrisSection(lines, assessment, includeScores) {
  if (!Array.isArray(assessment.norris_capacities) || assessment.norris_capacities.length === 0) {
    return;
  }

  lines.push(
    `## Norris capacities`,
    ``,
    `This section is an additive Norris et al. (2008) lens. It does not replace the 8-component scores.`,
    ``,
  );

  for (const cap of assessment.norris_capacities) {
    appendNorrisCapacity(lines, cap, includeScores);
  }
}

/**
 * @param {string[]} lines
 * @param {object} assessment
 * @param {boolean} includeScores
 */
export function appendComponentsTable(lines, assessment, includeScores) {
  if (includeScores) {
    lines.push(
      `## Components`,
      ``,
      COMPONENTS_TABLE_HELP_MARKDOWN,
      ``,
      `| # | Component | עברית | Assessment reliability | Evidence level | Evidence base | Article coverage |`,
      `|---|-----------|-------|------------------------|----------------|---------------|------------------|`,
    );
  } else {
    lines.push(
      `## Components`,
      ``,
      `| # | Component | עברית | Assessment reliability | Evidence base | Article coverage |`,
      `|---|-----------|-------|------------------------|---------------|------------------|`,
    );
  }

  (assessment.components ?? []).forEach((comp, i) => {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    const coveragePct = dashIfNull(comp.coverage_ratio, (v) => `${(v * 100).toFixed(0)}%`);
    const certPct = dashIfNull(comp.certainty, (v) => `${(v * 100).toFixed(0)}%`);
    const nameEn = def.name_en ?? comp.component_id;
    const nameHe = def.name_he ?? '';
    const reliability = summarizeConfidence(comp.confidence);
    const signalCount = comp.signal_count ?? 0;
    const articleCount = comp.distinct_article_count ?? '—';
    const totalArticles = assessment.total_articles_analyzed;

    if (includeScores) {
      lines.push(
        `| ${i + 1} | ${nameEn} | ${nameHe} | ${reliability} | ${certPct} | ${signalCount} signals | ${articleCount}/${totalArticles} (${coveragePct}) |`,
      );
    } else {
      lines.push(
        `| ${i + 1} | ${nameEn} | ${nameHe} | ${reliability} | ${signalCount} signals | ${articleCount}/${totalArticles} (${coveragePct}) |`,
      );
    }
  });
  lines.push(``, `---`, ``);
}

/**
 * @param {string[]} lines
 * @param {object} assessment
 * @param {boolean} includeScores
 * @param {{ evidenceDirection: Function, i18n: Function }} formatters
 */
export function appendComponentDetails(lines, assessment, includeScores, formatters) {
  lines.push(`## Detailed Analysis`, ``);

  for (const comp of assessment.components ?? []) {
    appendOneComponentDetail(lines, comp, assessment, includeScores, formatters);
  }
}

/**
 * @param {string[]} lines
 * @param {object} assessment
 */
export function appendMacroAndCaveats(lines, assessment) {
  lines.push(`## Evidence Quality`, ``, assessment.evidence_quality_note ?? '', ``);
}
