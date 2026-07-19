/**
 * Section builders for resilience assessment Markdown reports (single view,
 * evidence-based — no numeric scores).
 */

import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import { summarizeConfidence } from '../domain/services/signals/behaviorSignals.js';
import { COMPONENTS_TABLE_HELP_MARKDOWN } from '../domain/contracts/componentsTableGlossary.js';

const COMPONENT_MAP = Object.fromEntries(RESILIENCE_COMPONENTS.map((c) => [c.id, c]));

const BALANCE_LABEL = {
  one_sided_pos: 'supporting only',
  one_sided_neg: 'opposing only',
  mixed: 'mostly one-directional',
  contested: 'contested (split evidence)',
};

function sufficiencyLabel(basis) {
  return (basis?.sufficiency ?? '—').replaceAll('_', ' ');
}

function balanceLabel(basis) {
  const b = basis?.balance;
  return b ? (BALANCE_LABEL[b] ?? b) : '—';
}

function sourceMixLabel(basis) {
  const mix = basis?.source_mix ?? {};
  const parts = Object.entries(mix).map(([k, n]) => `${k}: ${n}`);
  return parts.length ? parts.join(', ') : '—';
}

function appendComponentCriticalNotes(lines, comp) {
  if (comp.presence_gate_triggered === true) {
    const gate = comp.presence_gate ?? {};
    lines.push(
      `> **Note — critical presence failure:** verified evidence of a critical failure mode (${gate.signal_type ?? 'critical signal'}) is present for this component, independent of the overall evidence balance.`,
    );
  }

  if (comp.salience_critical === true) {
    lines.push(
      `> **Note — critical single signal:** one verified high-stakes report drives attention on this component. Corroboration is still limited — treat as an early warning, not a census.`,
    );
  }

  const basis = comp.evidence_basis ?? {};
  if (basis.balance === 'contested') {
    lines.push(
      `> **Note — contested evidence:** supporting and opposing observations are split (${basis.positive_count ?? 0} vs ${basis.negative_count ?? 0}); the narrative reflects an unresolved disagreement, not a single direction.`,
    );
  }

  const cw = basis.concentration_warning;
  if (cw) {
    lines.push(
      `> **Note — concentrated evidence:** ${cw.layer.replaceAll('_', ' ')} "${cw.key}" holds ${Math.round(cw.share * 100)}% of this component's signals; treat breadth claims cautiously.`,
    );
  }

  if ((basis.sufficiency ?? null) === 'thin') {
    lines.push(
      `> **Note — thin evidence:** this component rests on ${basis.signal_count ?? 0} signal(s) from ${basis.distinct_articles ?? 0} article(s); treat cautiously.`,
    );
  }
}

function appendComponentMetrics(lines, comp, assessment, evidenceDirection) {
  const basis = comp.evidence_basis ?? {};
  const articleCoverage = `${comp.distinct_article_count ?? '—'} of ${assessment.total_articles_analyzed}`;

  lines.push(
    `**Assessment reliability:** ${summarizeConfidence(comp.confidence)} *(based on how much evidence was found and how broadly it appears across the sample)*`,
    `**Evidence base:** ${comp.signal_count ?? 0} behavioral signals in ${articleCoverage} articles *(sufficiency: ${sufficiencyLabel(basis)}; source mix — ${sourceMixLabel(basis)})* | **Evidence direction:** ${evidenceDirection(basis.positive_count, basis.negative_count)}`,
  );
}

function appendOneComponentDetail(lines, comp, assessment, { evidenceDirection, i18n }) {
  const def = COMPONENT_MAP[comp.component_id] ?? {};

  lines.push(
    `### ${i18n(comp.component_id)} ${def.name_en ?? comp.component_id}`,
    `*${def.name_he ?? ''}*`,
    ``,
  );

  appendComponentMetrics(lines, comp, assessment, evidenceDirection);
  appendComponentCriticalNotes(lines, comp);

  if (comp.data_quality_caveat) {
    lines.push(``, `*Data quality:* ${comp.data_quality_caveat}`);
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
 */
export function appendMethodologyBlock(lines, assessment) {
  if (!assessment.methodology) return;

  const m = assessment.methodology;
  lines.push(
    `## Methodology`,
    ``,
    `**Phase:** ${m.phase ?? 'national_and_north_only'}. Evidence-based assessment: per-component narratives grounded in verified behavioral signals; sufficiency and balance derive from signal counts and source diversity — no numeric resilience scores.`,
    ``,
  );

  if (m.governance?.headline_scores_are) {
    lines.push(`> ${m.governance.headline_scores_are}`, ``);
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
 */
export function appendComponentsTable(lines, assessment) {
  lines.push(
    `## Components`,
    ``,
    COMPONENTS_TABLE_HELP_MARKDOWN,
    ``,
    `| # | Component | עברית | Assessment reliability | Evidence base | Sufficiency | Balance | Article coverage |`,
    `|---|-----------|-------|------------------------|---------------|-------------|---------|------------------|`,
  );

  (assessment.components ?? []).forEach((comp, i) => {
    const def = COMPONENT_MAP[comp.component_id] ?? {};
    const basis = comp.evidence_basis ?? {};
    const nameEn = def.name_en ?? comp.component_id;
    const nameHe = def.name_he ?? '';
    const reliability = summarizeConfidence(comp.confidence);
    const signalCount = comp.signal_count ?? 0;
    const articleCount = comp.distinct_article_count ?? '—';
    const totalArticles = assessment.total_articles_analyzed;

    lines.push(
      `| ${i + 1} | ${nameEn} | ${nameHe} | ${reliability} | ${signalCount} signals | ${sufficiencyLabel(basis)} | ${balanceLabel(basis)} | ${articleCount}/${totalArticles} |`,
    );
  });
  lines.push(``, `---`, ``);
}

/**
 * @param {string[]} lines
 * @param {object} assessment
 * @param {{ evidenceDirection: Function, i18n: Function }} formatters
 */
export function appendComponentDetails(lines, assessment, formatters) {
  lines.push(`## Detailed Analysis`, ``);

  for (const comp of assessment.components ?? []) {
    appendOneComponentDetail(lines, comp, assessment, formatters);
  }
}

/**
 * @param {string[]} lines
 * @param {object} assessment
 */
export function appendMacroAndCaveats(lines, assessment) {
  lines.push(`## Evidence Quality`, ``, assessment.evidence_quality_note ?? '', ``);
}
