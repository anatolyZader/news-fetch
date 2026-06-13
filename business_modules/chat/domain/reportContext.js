/**
 * Build the system prompt context from a resilience report.
 */
import { buildPboIndex } from './pboIndex.js';
import { listReportDates, listSignalMeta } from './signalLookup.js';
import { wrapUntrustedBlock } from '../../../cross-cut-modules/security/index.js';
import { DISPLAY_VIEWS } from '../../../cross-cut-modules/resilience-contracts/index.js';
import {
  deriveInstrumentState,
  operatorAssessmentSummary,
  buildAttentionItems,
} from '../../resilience/index.js';

const MAX_ATTENTION_SUMMARY = 8;
const EXEC_SUMMARY_MAX_CHARS = 2000;
const INSTRUMENT_NARRATIVE_MAX_CHARS = 300;

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
  if (brief.summary) {
    block += `Summary: ${wrapUntrustedBlock(brief.summary, { label: 'decision_brief_summary' })}\n`;
  }
  const ids = (brief.priority_items ?? [])
    .slice(0, 5)
    .map((p) => p.attention_id ?? p.recommendation_id ?? '?')
    .join(', ');
  if (ids) block += `Priority refs: ${ids}\n`;
  return `${block}\n`;
}

function clipText(text, maxChars) {
  const s = String(text ?? '');
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}…`;
}

function formatComponentBlock(c, { includeScores }) {
  const id = c.component_id ?? 'unknown';
  const narrative = wrapUntrustedBlock(c.narrative ?? '', { label: `component:${id}` });
  if (includeScores && c.score != null) {
    return `### ${id} (${c.score}/10, ${c.confidence})\n${narrative}`;
  }
  const inst = c.instrument ?? deriveInstrumentState(c);
  const instLine =
    `confidence=${inst.confidence}, sufficiency=${inst.evidence_sufficiency}` +
    `${inst.contested ? ', contested' : ''}` +
    `${inst.significant_delta ? ', significant_delta' : ''}`;
  return `### ${id} (${instLine})\n${narrative}`;
}

function formatComponentInstrumentSummary(c, { includeScores }) {
  const id = c.component_id ?? 'unknown';
  const narrative = wrapUntrustedBlock(
    clipText(c.narrative ?? '', INSTRUMENT_NARRATIVE_MAX_CHARS),
    { label: `component_summary:${id}` },
  );
  if (includeScores && c.score != null) {
    return `- ${id}: ${c.score}/10 (${c.confidence}) — ${narrative}`;
  }
  const inst = c.instrument ?? deriveInstrumentState(c);
  const instLine =
    `confidence=${inst.confidence}, sufficiency=${inst.evidence_sufficiency}` +
    `${inst.contested ? ', contested' : ''}` +
    `${inst.significant_delta ? ', significant_delta' : ''}`;
  return `- ${id} (${instLine}) — ${narrative}`;
}

function formatV2ContextBlock(assessment) {
  if (assessment?.schema_version !== '2.0') return '';
  const gaps = (assessment.retrieval_gaps ?? []).slice(0, 6);
  let block = `Assessment v2 (agent trace: ${assessment.agent_trace_id ?? 'n/a'})\n`;
  if (gaps.length) block += `Retrieval gaps: ${gaps.join('; ')}\n`;
  if (assessment.epistemic_profile_ref) {
    block += `Epistemic profile: ${assessment.epistemic_profile_ref}\n`;
  }
  return `${block}\n`;
}

function formatHeader(assessment, { includeScores }) {
  if (includeScores) {
    const scores = (assessment.components ?? [])
      .map((c) => `- ${c.component_id}: ${c.score}/10 (${c.confidence})`)
      .join('\n');
    return (
      `Today's resilience assessment (${assessment.date})\n` +
      `Overall score: ${assessment.overall_resilience_score}/10\n\n` +
      `Component scores:\n${scores}\n\n`
    );
  }
  return (
    `Today's resilience assessment (${assessment.date})\n` +
    `${operatorAssessmentSummary(assessment)}\n\n` +
    `Component instrument summary (no headline 1–10 scores in operator view):\n`
  );
}

function formatToolFooter() {
  const reportDates = listReportDates();
  const { sourceTypes, signalDates } = listSignalMeta();
  return (
    `\n\nAVAILABLE DATA FOR TOOLS:\n` +
    `Report dates (for compare_dates): ${reportDates.join(', ')}\n` +
    `Signal source types (for lookup_signals): ${sourceTypes.join(', ')}\n` +
    `Signal dates: ${signalDates.join(', ')}`
  );
}

function formatContextSliceFooter(contextSlice) {
  return (
    `\n[Chat context slice: ${contextSlice}. ` +
    'Use tools for full narratives, PBO data, and verbatim sources.]'
  );
}

function formatExecutiveSummary(assessment, maxChars = EXEC_SUMMARY_MAX_CHARS) {
  const text = assessment?.cross_component_synthesis ?? '';
  if (!text) return '';
  const wrapped = wrapUntrustedBlock(clipText(text, maxChars), { label: 'executive_summary' });
  return `Executive summary:\n${wrapped}\n\n`;
}

function buildFullContext(a, reportScopeId, includeScores) {
  return (
    formatV2ContextBlock(a) +
    formatHeader(a, { includeScores }) +
    formatAttentionItemsSummary(a, reportScopeId) +
    formatDecisionBriefSummary(a) +
    formatExecutiveSummary(a, Number.MAX_SAFE_INTEGER) +
    formatPendingRecommendations(a) +
    `Components detail:\n` +
    (a.components ?? [])
      .map((c) => formatComponentBlock(c, { includeScores }))
      .join('\n\n')
  );
}

function buildCompareContext(a, reportScopeId, includeScores) {
  return (
    formatV2ContextBlock(a) +
    formatHeader(a, { includeScores })
  );
}

function buildHubContext(a, reportScopeId, includeScores) {
  return (
    formatV2ContextBlock(a) +
    formatHeader(a, { includeScores }) +
    formatAttentionItemsSummary(a, reportScopeId) +
    formatDecisionBriefSummary(a)
  );
}

function buildMinimalContext(a, includeScores) {
  return formatV2ContextBlock(a) + formatHeader(a, { includeScores });
}

function buildStandardContext(a, reportScopeId, includeScores) {
  const instrumentLines = (a.components ?? [])
    .map((c) => formatComponentInstrumentSummary(c, { includeScores }))
    .join('\n');
  return (
    formatV2ContextBlock(a) +
    formatHeader(a, { includeScores }) +
    formatAttentionItemsSummary(a, reportScopeId) +
    formatDecisionBriefSummary(a) +
    formatExecutiveSummary(a) +
    formatPendingRecommendations(a) +
    (instrumentLines ? `Component summaries (truncated — use tools for full detail):\n${instrumentLines}\n` : '')
  );
}

function buildComponentContext(a, reportScopeId, includeScores, componentId) {
  const comp = (a.components ?? []).find((c) => c.component_id === componentId);
  const componentBlock = comp
    ? formatComponentBlock(comp, { includeScores })
    : `(Component ${componentId} not found in report.)`;
  return (
    formatV2ContextBlock(a) +
    formatHeader(a, { includeScores }) +
    formatExecutiveSummary(a) +
    `Component detail:\n${componentBlock}\n`
  );
}

/**
 * @param {object | null | undefined} reportData
 * @param {{
 *   includeScores?: boolean,
 *   reportScopeId?: string,
 *   contextSlice?: string,
 *   componentId?: string,
 * }} [opts]
 */
export function buildReportContext(reportData, opts = {}) {
  if (!reportData) {
    return { context: 'No resilience report is available for today yet.', pboLookup: {}, contextSlice: 'full' };
  }
  const a = reportData.assessment;
  const includeScores = opts.includeScores === true;
  const reportScopeId = opts.reportScopeId
    ?? a?.report_scope?.id
    ?? reportData.report_scope?.id
    ?? 'national';
  const contextSlice = opts.contextSlice ?? 'full';
  const componentId = opts.componentId;

  const { index: pboIndex, lookup: pboLookup } = buildPboIndex(reportData.signals ?? a.signals);

  let body;
  switch (contextSlice) {
    case 'compare':
      body = buildCompareContext(a, reportScopeId, includeScores);
      break;
    case 'hub':
      body = buildHubContext(a, reportScopeId, includeScores);
      break;
    case 'minimal':
      body = buildMinimalContext(a, includeScores);
      break;
    case 'component':
      body = buildComponentContext(a, reportScopeId, includeScores, componentId);
      break;
    case 'standard':
      body = buildStandardContext(a, reportScopeId, includeScores);
      break;
    case 'full':
    default:
      body = buildFullContext(a, reportScopeId, includeScores);
      break;
  }

  const context = body + formatPboIndexWrapped(pboIndex) + formatToolFooter() + formatContextSliceFooter(contextSlice);
  return { context, pboLookup, contextSlice };
}

function formatPboIndexWrapped(pboIndex) {
  if (!pboIndex?.trim()) return '';
  return wrapUntrustedBlock(pboIndex, { label: 'pbo_index' });
}
