/**
 * Chat tool handlers — (toolName, input, ctx) => string | Promise<string>
 */
import { getDefaultLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { HAIKU_MODEL } from '../../../cross-cut-modules/llm/modelIds.js';
import { chatModel } from '../../../cross-cut-modules/agent/index.js';
import {
  loadSignals,
  searchSignals,
  formatSignals,
  compareReports,
  loadReport,
  listReportDates,
  loadObservations,
  signalStats,
} from '../domain/signalLookup.js';
import {
  buildReportContext,
  formatHeader,
  formatComponentInstrumentSummary,
} from '../domain/reportContext.js';
import { formatComponentEvidenceBundle } from '../domain/componentEvidenceBundle.js';
import {
  deriveInstrumentState,
  DISPLAY_VIEWS,
  normalizeReportScope,
  buildAttentionItems,
} from '../../resilience_scorer/index.js';
import { searchSources, getSource, listSources } from '../domain/sourceArchiveQuery.js';
import { pboReviewRagEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';
import { requireAnalyst } from './createChatToolContext.js';
import {
  PROPOSE_TOOL_NAMES,
  OPERATOR_PROPOSE_TOOL_NAMES,
  chatCompressToolsEnabled,
} from '../domain/chatConfig.js';
import { compressChatToolResult } from '../domain/chatToolCompress.js';
import { extractCitationsFromToolResult } from '../domain/chatCitations.js';
import { wrapToolResultIfUntrusted, wrapUntrustedBlock } from '../../../cross-cut-modules/security/index.js';
import { buildComponentTimeline, formatComponentTimeline } from '../domain/traceComponentTimeline.js';
import { resolveMunicipalityName } from '../domain/municipalityResolve.js';


function inferredDate(input, reportData) {
  return input?.date ?? reportData?.assessment?.date ?? reportData?.reportDate ?? null;
}

async function handleProposeTool(toolName, input, ctx) {
  const isOperatorPropose = OPERATOR_PROPOSE_TOOL_NAMES.has(toolName);
  if (!isOperatorPropose) {
    const gate = requireAnalyst(ctx, toolName);
    if (gate) return gate;
  }
  if (!ctx.confirmActionsEnabled) {
    return 'Confirm-gated actions are disabled (CHAT_CONFIRM_ACTIONS_ENABLED=0).';
  }
  if (!ctx.pendingActionStore || !ctx.ownerUid || !ctx.sessionId) {
    return 'Pending action store not configured.';
  }

  let summary = '';
  if (toolName === 'propose_geo_unknown_update') {
    summary = `Geo unknown #${input.id} → ${input.status}`;
  } else if (toolName === 'propose_operator_recommendation') {
    const action = String(input?.action ?? '');
    if (action !== 'acknowledge' && action !== 'dismiss') {
      return 'Invalid action. Use acknowledge or dismiss.';
    }
    summary = `Operator recommendation ${input.recommendation_id}: ${action}`;
  }

  const { id, expiresAt } = ctx.pendingActionStore.createPending({
    ownerUid: ctx.ownerUid,
    sessionId: ctx.sessionId,
    toolName,
    params: input,
    summary,
  });

  ctx.onActionProposed?.({
    type: 'action_proposed',
    actionId: id,
    toolName,
    summary,
    expiresAt,
  });

  return (
    `Action proposed (ID: ${id}). The user must confirm in the chat UI before this is applied. ` +
    `Summary: ${summary}. Do not claim the action was executed.`
  );
}

function formatComponentBriefLine(component, includeScores) {
  if (includeScores && component.score != null) {
    return `${component.component_id}: ${component.score}/10 (${component.confidence}) — ${component.narrative?.slice(0, 400) ?? ''}\n\n`;
  }
  const inst = component.instrument ?? deriveInstrumentState(component);
  return `${component.component_id}: (${inst.confidence}, ${inst.evidence_sufficiency}) — ${component.narrative?.slice(0, 400) ?? ''}\n\n`;
}

function buildAssessmentBriefContext(reportData, opts = {}) {
  if (!reportData?.assessment) return '';
  const assessment = reportData.assessment;
  const includeScores = opts.includeScores === true;
  let context = formatHeader(assessment, { includeScores });
  context += `Executive summary: ${assessment.cross_component_synthesis?.slice(0, 2000) ?? 'N/A'}\n\n`;
  for (const component of assessment.components ?? []) {
    context += formatComponentBriefLine(component, includeScores);
  }
  return context;
}

function appendMunicipalityBriefContext(context, scope, municipality, pboLookup) {
  if (scope !== 'municipality' || !municipality) return context;
  let next = context;
  const resolved = resolveMunicipalityName(municipality, {
    pboLookupKeys: Object.keys(pboLookup),
  });
  const muniData = pboLookup[municipality] ?? (resolved ? pboLookup[resolved] : null) ?? '';
  if (muniData) next += `\nPBO data for ${municipality}:\n${muniData}\n`;
  const signals = loadSignals({});
  const matches = searchSignals(signals, { municipality, limit: 15 });
  if (matches.length > 0) next += `\nRecent signals for ${municipality}:\n${formatSignals(matches)}\n`;
  return next;
}

async function generateBrief(input, reportData, pboLookup, costRecorder = null) {
  const { scope, municipality, audience, language } = input;
  let briefContext = buildAssessmentBriefContext(reportData, {
    includeScores: reportData?.display_view === DISPLAY_VIEWS.analyst,
  });
  briefContext = appendMunicipalityBriefContext(briefContext, scope, municipality, pboLookup);

  const audienceInstructions = {
    commander: 'Write for a military/civil defense commander: concise, action-oriented, focus on operational gaps.',
    analyst: 'Write for a resilience analyst: evidence-rich, cite specific signals and sources.',
    public: 'Write for public communication: accessible language, no jargon.',
  };
  let langInstructions = 'Write the brief in English.';
  if (language === 'he') langInstructions = 'Write the brief in Hebrew.';
  else if (language === 'ru') langInstructions = 'Write the brief in Russian.';
  const scopeInstructions = scope === 'municipality'
    ? `Focus the brief on the municipality: ${municipality}.`
    : 'Produce an overall situation brief covering all components.';

  const model = HAIKU_MODEL;
  const response = await getDefaultLlmPort().createMessage({
    model,
    max_tokens: 3000,
    system: 'You are a resilience assessment brief writer.',
    messages: [{
      role: 'user',
      content:
        `${audienceInstructions[audience] ?? audienceInstructions.analyst}\n` +
        `${langInstructions}\n${scopeInstructions}\n\nDATA:\n` +
        `${wrapUntrustedBlock(briefContext, { label: 'brief_context' })}`,
    }],
  });
  if (costRecorder && response.usage) {
    costRecorder.onUsage({ label: 'chat:generate_brief', model, usage: response.usage });
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return text || 'Brief generation returned empty.';
}

async function handleLookupPbo(input, ctx) {
  const muniName = input?.municipality ?? '';
  const resolved = resolveMunicipalityName(muniName, {
    pboLookupKeys: Object.keys(ctx.pboLookup),
  });
  const result = ctx.pboLookup[muniName] ?? (resolved ? ctx.pboLookup[resolved] : null);
  return result ?? `No PBO data found for "${muniName}". Available: ${Object.keys(ctx.pboLookup).join(', ')}`;
}

function handleLookupSignals(input) {
  const dateFrom = input.date_from ?? undefined;
  const dateTo = input.date_to ?? undefined;
  const signals = loadSignals({
    date: input.date,
    dateFrom,
    dateTo,
    sourceType: input.source_type,
  });
  const matches = searchSignals(signals, {
    query: input.query,
    component: input.component,
    sourceType: input.source_type,
    municipality: input.municipality,
    limit: Math.min(input.limit ?? 10, 25),
  });
  const groupBy = input.group_by === 'date' ? 'date' : undefined;
  return formatSignals(matches, { groupBy });
}

async function handleTraceComponentTimeline(_toolName, input, ctx) {
  const includeScores = ctx.reportData?.display_view === DISPLAY_VIEWS.analyst;
  const result = await buildComponentTimeline(input, {
    includeScores,
    isAnalyst: ctx.isAnalyst,
    getMunicipalityDashboard: ctx.getMunicipalityDashboard ?? null,
    pboReportReviewService: ctx.pboReportReviewService ?? null,
  });
  return formatComponentTimeline(result);
}

function handleCompareDates(input, ctx) {
  const includeScores = ctx.reportData?.display_view === DISPLAY_VIEWS.analyst;
  return compareReports(input.date_a, input.date_b, { includeScores });
}

function handleListSources(input, ctx) {
  return listSources({ ...input, date: inferredDate(input, ctx.reportData) }, ctx.sourceArchive);
}

function handleGetSource(input, ctx) {
  const source_id = input?.source_id ?? input?.evidence_id;
  const max_chars = Math.min(Number(input?.max_chars ?? 8000) || 8000, 25_000);
  return getSource(
    { ...input, source_id, max_chars, date: inferredDate(input, ctx.reportData) },
    ctx.sourceArchive,
    ctx.evidenceStore,
  );
}

function handleSearchSources(input, ctx) {
  return searchSources(
    { ...input, date: inferredDate(input, ctx.reportData) },
    ctx.sourceArchive,
    ctx.retrievalService,
    { retrievalCache: ctx.retrievalCache ?? null },
  );
}

async function handleSearchPboHistory(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  if (!pboReviewRagEnabled()) return 'PBO historical search RAG is disabled.';
  const svc = ctx.pboHistoricalSearchService;
  if (!svc?.search) return 'PBO historical search unavailable.';
  const result = await svc.search(input);
  if (!result.enabled) return 'PBO historical search is disabled.';
  const hits = (result.hits ?? []).slice(0, input.limit ?? 8);
  if (!hits.length) return 'No PBO history hits.';
  return hits.map((h, i) =>
    `${i + 1}. ${h.title ?? h.municipality ?? '?'} (${h.report_date ?? ''}): ${String(h.snippet ?? h.body ?? '').slice(0, 200)}`,
  ).join('\n');
}

async function handleListPboReviews(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  const svc = ctx.pboReportReviewService;
  if (!svc?.listReviewsForDate) return 'PBO review service unavailable.';
  const reviews = await svc.listReviewsForDate(input.date);
  if (!reviews?.length) return `No PBO reviews for ${input.date}.`;
  return reviews.map((r) =>
    `- ${r.municipality ?? r.municipality_name ?? '?'}: status=${r.status ?? r.review_status ?? 'unknown'}`,
  ).join('\n');
}

async function handleGetPboReview(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  const svc = ctx.pboReportReviewService;
  if (!svc?.getReviewDetail) return 'PBO review service unavailable.';
  const detail = await svc.getReviewDetail(input.date, input.municipality);
  if (!detail) return `No review for ${input.municipality} on ${input.date}.`;
  return JSON.stringify(detail, null, 2).slice(0, 8000);
}

function handleListGeoUnknown(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  const svc = ctx.geoUnknownReviewService;
  if (!svc?.list) return 'Geo unknown review unavailable (GEO_UNKNOWN_REVIEW_SQLITE=1 required).';
  const rows = svc.list({ status: input.status ?? 'new', limit: Math.min(input.limit ?? 20, 50) });
  if (!rows.length) return 'No geo unknown entries.';
  return rows.map((r) =>
    `#${r.id} "${r.raw_name_last ?? r.raw_name_norm}" (${r.reason}) count=${r.occurrence_count} status=${r.status}`,
  ).join('\n');
}

function handleListAttentionItems(_toolName, input, ctx) {
  const a = ctx.reportData?.assessment;
  if (!a) return 'No assessment loaded.';
  const scopeId = normalizeReportScope(
    ctx.reportData?.report_scope?.id ?? a.report_scope?.id ?? 'national',
  );
  const limit = Math.min(Math.max(input?.limit ?? 15, 1), 25);
  const items = buildAttentionItems(a, {
    view: DISPLAY_VIEWS.operator,
    reportScopeId: scopeId,
  }).slice(0, limit);
  if (!items.length) return 'No attention items for this assessment.';
  return items.map((it) => {
    const componentPart = it.component_id ? ` component=${it.component_id}` : '';
    const titlePart = it.title_key ? ` title=${it.title_key}` : '';
    return `- [${it.id}] ${it.level} ${it.code}${componentPart}${titlePart}`;
  }).join('\n');
}

function handleListOperatorRecommendations(_toolName, input, ctx) {
  const a = ctx.reportData?.assessment;
  if (!a) return 'No assessment loaded.';
  const statusFilter = input?.status ?? 'pending';
  let recs = a.operator_recommendations ?? [];
  if (statusFilter !== 'all') {
    recs = recs.filter((r) => r.status === statusFilter);
  }
  if (!recs.length) return `No operator recommendations (status=${statusFilter}).`;
  return recs.map((r) => {
    const actionType = r.recommended_action?.type ?? 'n/a';
    const channels = (r.recommended_action?.channels ?? []).join(', ');
    const channelsPart = channels ? ` channels=${channels}` : '';
    return (
      `- [${r.id}] ${r.pattern_code} level=${r.level} status=${r.status} action=${actionType}` +
      `${channelsPart} component=${r.component_id ?? 'n/a'}`
    );
  }).join('\n');
}

function handleGetDecisionBrief(_toolName, _input, ctx) {
  const brief = ctx.reportData?.assessment?.decision_brief;
  if (!brief) {
    return 'No decision brief on this report (run assess-signals with RESILIENCE_DECISION_BRIEF_ENABLED).';
  }
  return JSON.stringify(brief, null, 2).slice(0, 12000);
}

function handleGetReport(_toolName, input, ctx) {
  const date = String(input?.date ?? '').trim();
  const scope = normalizeReportScope(String(input?.scope ?? 'national'));
  const report = loadReport(date, scope);
  if (!report?.assessment) {
    return `No report found for ${date} (scope=${scope}). Available dates: ${listReportDates().join(', ')}`;
  }
  const includeScores = ctx.reportData?.display_view === DISPLAY_VIEWS.analyst;
  const a = report.assessment;
  const lines = (a.components ?? [])
    .map((c) => formatComponentInstrumentSummary(c, { includeScores }))
    .join('\n');
  const exec = String(a.cross_component_synthesis ?? '').slice(0, 1000);
  return (
    formatHeader(a, { includeScores }) +
    lines +
    (exec ? `\n\nExecutive summary (excerpt):\n${exec}` : '')
  );
}

const REPORT_CONTEXT_SLICES = new Set(['full', 'component', 'hub', 'standard']);

function handleGetReportContext(_toolName, input, ctx) {
  if (!ctx.reportData) return 'No report loaded for today.';
  const slice = REPORT_CONTEXT_SLICES.has(input?.slice) ? input.slice : 'standard';
  const componentId = String(input?.component ?? '').trim() || undefined;
  const includeScores = ctx.reportData?.display_view === DISPLAY_VIEWS.analyst;
  const { context } = buildReportContext(ctx.reportData, {
    includeScores,
    contextSlice: slice,
    componentId,
  });
  return context;
}

function handleListObservations(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  const rows = loadObservations({
    date: input?.date,
    profile: input?.profile,
    limit: Math.min(Math.max(input?.limit ?? 20, 1), 50),
  });
  if (!rows.length) return 'No open observations found.';
  return rows.map((o, i) =>
    `[${i + 1}] ${o.observation_id ?? o.file} (${o.profile ?? '?'}, ${o.date ?? '?'}, ${o.source_type ?? '?'}, ${o.polarity ?? '?'})\n` +
    `    ${String(o.behavioral_description ?? '').slice(0, 200)}\n` +
    `    evidence: ${String(o.evidence ?? '').slice(0, 200)}`,
  ).join('\n\n');
}

function handleGetComponentEvidenceBundle(_toolName, input, ctx) {
  const componentId = String(input?.component ?? '').trim();
  if (!componentId) return 'component is required';
  return formatComponentEvidenceBundle(ctx.reportData, componentId, {
    role: input?.role ?? null,
    limit: input?.limit ?? 50,
  });
}

const CHAT_TOOL_HANDLERS = {
  lookup_pbo: (_toolName, input, ctx) => handleLookupPbo(input, ctx),
  lookup_signals: (_toolName, input) => handleLookupSignals(input),
  get_component_evidence_bundle: handleGetComponentEvidenceBundle,
  compare_dates: (_toolName, input, ctx) => handleCompareDates(input, ctx),
  trace_component_timeline: handleTraceComponentTimeline,
  get_report: handleGetReport,
  get_report_context: handleGetReportContext,
  signal_stats: (_toolName, input) => signalStats(input ?? {}),
  list_observations: handleListObservations,
  generate_brief: (_toolName, input, ctx) =>
    generateBrief(
      { ...input, language: input.language ?? ctx.uiLang ?? 'en' },
      ctx.reportData,
      ctx.pboLookup,
      ctx.costRecorder,
    ),
  list_sources: (_toolName, input, ctx) => handleListSources(input, ctx),
  get_source: (_toolName, input, ctx) => handleGetSource(input, ctx),
  search_sources: (_toolName, input, ctx) => handleSearchSources(input, ctx),
  search_pbo_history: handleSearchPboHistory,
  list_pbo_reviews: handleListPboReviews,
  get_pbo_review: handleGetPboReview,
  list_geo_unknown: handleListGeoUnknown,
  list_attention_items: handleListAttentionItems,
  list_operator_recommendations: handleListOperatorRecommendations,
  get_decision_brief: handleGetDecisionBrief,
};

/**
 * @param {string} toolName
 * @param {object} input
 * @param {object} ctx from createChatToolContext
 */
export async function handleChatToolCall(toolName, input, ctx) {
  if (PROPOSE_TOOL_NAMES.has(toolName)) {
    return handleProposeTool(toolName, input, ctx);
  }

  const handler = CHAT_TOOL_HANDLERS[toolName];
  if (!handler) return 'Unknown tool';
  const raw = await handler(toolName, input, ctx);
  if (ctx.onCitation) {
    try {
      const citations = extractCitationsFromToolResult(toolName, String(raw ?? ''));
      if (citations.length) ctx.onCitation({ tool: toolName, citations });
    } catch { /* citations must not break tool execution */ }
  }
  const compressed = compressChatToolResult(toolName, raw, {
    enabled: chatCompressToolsEnabled(),
    economyOverride: ctx.economyOverride,
    strongModel: chatModel() !== HAIKU_MODEL,
  });
  return wrapToolResultIfUntrusted(toolName, compressed);
}

export { generateBrief, buildAssessmentBriefContext, CHAT_TOOL_HANDLERS };
