/**
 * Build the system prompt context from a resilience report.
 */
import { buildPboIndex } from './pboIndex.js';
import { listReportDates, listSignalMeta } from './signalLookup.js';
import { DISPLAY_VIEWS } from '../../../cross-cut-modules/resilience-contracts/index.js';
import {
  deriveInstrumentState,
  operatorAssessmentSummary,
  buildAttentionItems,
} from '../../resilience/index.js';

const MAX_ATTENTION_SUMMARY = 8;

function formatPendingRecommendations(assessment) {
  const pending = (assessment?.operator_recommendations ?? []).filter((r) => r.status === 'pending');
  if (pending.length === 0) return '';
  const lines = pending.map((r) => {
    const actionType = r.recommended_action?.type ?? 'n/a';
    return (
      `- [${r.id}] ${r.pattern_code} (${r.level}): action=${actionType} — ` +
      'use propose_operator_recommendation to acknowledge/dismiss'
    );
  });
  return `Pending operator recommendations:\n${lines.join('\n')}\n\n`;
}

/**
 * @param {object | null | undefined} assessment
 * @param {string} [reportScopeId]
 */
export function formatAttentionItemsSummary(assessment, reportScopeId = 'national') {
  if (!assessment) return '';
  const items = buildAttentionItems(assessment, {
    view: DISPLAY_VIEWS.operator,
    reportScopeId,
  }).slice(0, MAX_ATTENTION_SUMMARY);
  if (items.length === 0) return '';
  const lines = items.map((it) => {
    const componentPart = it.component_id ? ` (${it.component_id})` : '';
    return `- [${it.id}] ${it.level} ${it.code}${componentPart}`;
  });
  return `Top attention items (use list_attention_items for full list):\n${lines.join('\n')}\n\n`;
}

/**
 * @param {object | null | undefined} assessment
 */
export function formatDecisionBriefSummary(assessment) {
  const brief = assessment?.decision_brief;
  if (!brief?.summary && (brief?.priority_items?.length ?? 0) <= 0) return '';
  let block = 'Decision brief (use get_decision_brief for full detail):\n';
  if (brief.summary) block += `Summary: ${brief.summary}\n`;
  const ids = (brief.priority_items ?? [])
    .slice(0, 5)
    .map((p) => p.attention_id ?? p.recommendation_id ?? '?')
    .join(', ');
  if (ids) block += `Priority refs: ${ids}\n`;
  return `${block}\n`;
}

function formatComponentBlock(c, { includeScores }) {
  const id = c.component_id ?? 'unknown';
  if (includeScores && c.score != null) {
    return `### ${id} (${c.score}/10, ${c.confidence})\n${c.narrative ?? ''}`;
  }
  const inst = c.instrument ?? deriveInstrumentState(c);
  const instLine =
    `confidence=${inst.confidence}, sufficiency=${inst.evidence_sufficiency}` +
    `${inst.contested ? ', contested' : ''}` +
    `${inst.significant_delta ? ', significant_delta' : ''}`;
  return `### ${id} (${instLine})\n${c.narrative ?? ''}`;
}

/**
 * @param {object | null | undefined} reportData
 * @param {{ includeScores?: boolean, reportScopeId?: string }} [opts]
 */
export function buildReportContext(reportData, opts = {}) {
  if (!reportData) return { context: 'No resilience report is available for today yet.', pboLookup: {} };
  const a = reportData.assessment;
  const includeScores = opts.includeScores === true;
  const reportScopeId = opts.reportScopeId
    ?? a?.report_scope?.id
    ?? reportData.report_scope?.id
    ?? 'national';

  const { index: pboIndex, lookup: pboLookup } = buildPboIndex(reportData.signals ?? a.signals);

  const reportDates = listReportDates();
  const { sourceTypes, signalDates } = listSignalMeta();

  let header;
  if (includeScores) {
    const scores = (a.components ?? [])
      .map((c) => `- ${c.component_id}: ${c.score}/10 (${c.confidence})`)
      .join('\n');
    header =
      `Today's resilience assessment (${a.date})\n` +
      `Overall score: ${a.overall_resilience_score}/10\n\n` +
      `Component scores:\n${scores}\n\n`;
  } else {
    header =
      `Today's resilience assessment (${a.date})\n` +
      `${operatorAssessmentSummary(a)}\n\n` +
      `Component instrument summary (no headline 1–10 scores in operator view):\n`;
  }

  const context =
    header +
    formatAttentionItemsSummary(a, reportScopeId) +
    formatDecisionBriefSummary(a) +
    `Executive summary:\n${a.cross_component_synthesis ?? ''}\n\n` +
    formatPendingRecommendations(a) +
    `Components detail:\n` +
    (a.components ?? [])
      .map((c) => formatComponentBlock(c, { includeScores }))
      .join('\n\n') +
    pboIndex +
    `\n\nAVAILABLE DATA FOR TOOLS:\n` +
    `Report dates (for compare_dates): ${reportDates.join(', ')}\n` +
    `Signal source types (for lookup_signals): ${sourceTypes.join(', ')}\n` +
    `Signal dates: ${signalDates.join(', ')}`;
  return { context, pboLookup };
}
