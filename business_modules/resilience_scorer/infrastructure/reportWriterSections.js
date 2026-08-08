/**
 * Section builders for resilience assessment Markdown reports (single view,
 * evidence-based — no numeric scores).
 */

import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import { summarizeConfidence } from '../domain/services/signals/confidenceLabels.js';
import { COMPONENTS_TABLE_HELP_MARKDOWN } from '../domain/contracts/componentsTableGlossary.js';
import { CONSTRUCT_ROLES } from '../domain/contracts/signalCatalog.js';

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

/** Construct-role histogram in canonical story-arc order; unknown keys dropped. */
function constructMixLabel(basis) {
  const mix = basis?.construct_role_mix ?? {};
  const parts = CONSTRUCT_ROLES
    .filter((role) => mix[role] > 0)
    .map((role) => `${role.replaceAll('_', ' ')}: ${mix[role]}`);
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

  // A one-sided balance must not read as "no counter-evidence exists" when the
  // mirror twin of this component's evidence is deliberately anchored on
  // another component by catalog routing.
  const mirror = basis.mirror_context;
  const oneSided = basis.balance === 'one_sided_pos' || basis.balance === 'one_sided_neg';
  if (mirror && oneSided) {
    const parts = mirror.types.map((t) => {
      const anchors = t.anchor_components
        .map((cid) => COMPONENT_MAP[cid]?.name_en ?? cid)
        .join(', ');
      return `${t.count} \`${t.signal_type}\` signal(s) (anchored on ${anchors || 'no component'})`;
    });
    lines.push(
      `> **Note — mirror evidence anchored elsewhere:** the one-sided balance reflects catalog routing, not an absence of counter-evidence: ${parts.join('; ')} describe the mirrored side of this component's evidence and count toward the anchor component instead.`,
    );
  }

  if ((basis.sufficiency ?? null) === 'thin') {
    lines.push(
      `> **Note — thin evidence:** this component rests on ${basis.signal_count ?? 0} signal(s) from ${basis.distinct_articles ?? 0} article(s); treat cautiously.`,
    );
  }

  // Inferred edges are spillover from other components' primary evidence. When
  // they outweigh this component's own evidence AND run one way, the component
  // can read as well-evidenced and one-directional while resting on signals that
  // were never about it.
  const inferred = basis.inferred_context;
  const primaryCount = basis.signal_count ?? 0;
  if (inferred?.count && inferred.count >= Math.max(4, primaryCount)) {
    const lopsided = inferred.positive_count === 0 || inferred.negative_count === 0;
    const direction = inferred.negative_count === 0 ? 'supporting' : 'opposing';
    const split = lopsided
      ? `, and all of them point one way (${direction})`
      : ` (${inferred.positive_count} supporting / ${inferred.negative_count} opposing)`;
    lines.push(
      `> **Note — mostly inferred evidence:** ${inferred.count} of this component's observations are inferred spillover from other components (vs ${primaryCount} of its own)${split}. Inferred evidence is context, not direct observation of this component.`,
    );
  }
}

/**
 * Evidence held below the grounded tier: listed, not hidden.
 *
 * Demoted signals are excluded from the narrative because they failed verification
 * against the source text — but dropping them from the report entirely can erase a
 * whole class of evidence without trace. The reason codes matter: `low_similarity`
 * usually means the evidence could not be matched to the source (often a language
 * or paraphrase problem in extraction), not that the observation is false.
 */
function appendDemotedEvidence(lines, comp) {
  const block = comp.demoted_evidence;
  if (!block?.items?.length) return;

  const counts = Object.entries(block.counts ?? {})
    .map(([tier, n]) => `${n} ${tier.replaceAll('_', ' ')}`)
    .join(', ');
  const histogram = Object.entries(block.signal_types ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `\`${t}\` ×${n}`)
    .join(', ');

  lines.push(
    ``,
    `<details><summary><strong>Unverified evidence (${block.total}) — excluded from the narrative above</strong></summary>`,
    ``,
    `${counts}. These signals were extracted but could not be verified against their source text, so they carry no weight in the assessment. They are listed so that an absence here is visible rather than silent.`,
    ``,
    `**Types held back:** ${histogram || '—'}`,
  );
  if (block.critical_types_suppressed?.length) {
    const criticalTypes = block.critical_types_suppressed.map((t) => '`' + t + '`').join(', ');
    lines.push(
      ``,
      `> **Critical types among them:** ${criticalTypes}. A critical signal that cannot be verified is not the same as one that did not happen — it needs a look at the source, not dismissal.`,
    );
  }
  lines.push(
    ``,
    `| Signal type | Evidence | Tier | Why unverified | Source |`,
    `|---|---|---|---|---|`,
  );
  for (const it of block.items) {
    const evidence = String(it.evidence ?? '').replaceAll('|', '\\|').slice(0, 160);
    lines.push(
      `| \`${it.signal_type ?? '—'}\` | ${evidence} | ${it.grounding_tier ?? '—'} | ${it.grounding_reason ?? '—'} | ${it.article_source ?? '—'} |`,
    );
  }
  if (block.total > block.items.length) {
    lines.push(``, `*Showing ${block.items.length} of ${block.total}.*`);
  }
  lines.push(``, `</details>`);
}

/** Shared-coverage clause: how much of this component's evidence also feeds other components. */
function sharedCoverageLabel(basis) {
  const shared = basis?.shared_primary_articles;
  if (!shared || !shared.count) return '';
  const pct = shared.share == null ? '' : ` (${Math.round(shared.share * 100)}%)`;
  return `; shared coverage — ${shared.count}${pct} of its evidence units also feed other components`;
}

function appendComponentMetrics(lines, comp, assessment, evidenceDirection) {
  const basis = comp.evidence_basis ?? {};
  const articleCoverage = `${comp.distinct_article_count ?? '—'} of ${assessment.total_articles_analyzed}`;

  const reliabilityNote = comp.confidence_caveat
    ? `*(${comp.confidence_caveat})*`
    : '*(based on how much evidence was found and how broadly it appears across the sample)*';
  lines.push(
    `**Assessment reliability:** ${summarizeConfidence(comp.confidence)} ${reliabilityNote}`,
    `**Evidence base:** ${comp.signal_count ?? 0} behavioral signals in ${articleCoverage} evidence units *(sufficiency: ${sufficiencyLabel(basis)}; source mix — ${sourceMixLabel(basis)}; constructs — ${constructMixLabel(basis)}${sharedCoverageLabel(basis)})* | **Evidence direction:** ${evidenceDirection(basis.positive_count, basis.negative_count)}`,
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

  appendDemotedEvidence(lines, comp);

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
    `| **Evidence units analyzed** | ${assessment.total_articles_analyzed} *(news articles + municipal dashboard rows + field-visit reports)* |`,
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

  // Every component reads `specialist_skipped` on the closed-core path, which
  // looks like a failure until you know that path is the default. Say which
  // producer ran, so the reader is not left to infer it from a per-component flag.
  if (assessment.assessment_producer === 'closed_core') {
    lines.push(
      `**Assessment producer:** closed core — narratives are generated directly from the verified evidence pool, without per-component specialist agents. Components therefore report \`specialist_skipped\`; this is the standard path, not a degraded run.`,
      ``,
    );
  }

  const sds = m.scope?.scope_decision_summary;
  if (sds?.by_source) {
    const parts = Object.entries(sds.by_source).map(([k, n]) => `${k}: ${n}`);
    lines.push(`**Scope decisions:** ${parts.join('; ')}.`, ``);
  }

  const lh = m.scope?.load_hygiene;
  if (lh?.total > 0) {
    const parts = Object.entries(lh.by_source ?? {}).map(([k, n]) => `${k}: ${n}`);
    const bySource = parts.length === 0 ? '' : ` (${parts.join('; ')})`;
    lines.push(
      `**No-change reports excluded:** ${lh.total} contentless field/municipal rows ("no change", "not relevant") were dropped before counting${bySource} — they are status confirmations, not behavioral evidence.`,
      ``,
    );
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
    `| # | Component | עברית | Assessment reliability | Evidence base | Sufficiency | Balance | Unit coverage |`,
    `|---|-----------|-------|------------------------|---------------|-------------|---------|---------------|`,
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
  const note = String(assessment.evidence_quality_note ?? '').trim();
  if (!note) return;
  lines.push(`## Evidence Quality`, ``, note, ``, `---`, ``);
}
