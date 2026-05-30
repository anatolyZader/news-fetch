/**
 * Chat tool handlers — (toolName, input, ctx) => string | Promise<string>
 */
import Anthropic from '@anthropic-ai/sdk';
import { loadSignals, searchSignals, formatSignals, compareReports } from '../domain/signalLookup.js';
import {
  deriveInstrumentState,
  operatorAssessmentSummary,
  DISPLAY_VIEWS,
} from '../../resilience/domain/services/assessmentDisplayTier.js';
import { searchSources, getSource, listSources } from '../domain/sourceArchiveQuery.js';
import { pboReviewRagEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';
import { normalizeReportScope } from '../../resilience/domain/services/regionSignalFilter.js';
import { requireAnalyst } from './createChatToolContext.js';
import { PROPOSE_TOOL_NAMES } from '../domain/chatConfig.js';

const briefClient = new Anthropic();

const VALIDATION_ACTIONS = new Set([
  'label', 'skip', 'defer', 'gold_signal', 'confirm_social_quarantine', 'dismiss_social_quarantine',
]);

function inferredDate(input, reportData) {
  return input?.date ?? reportData?.assessment?.date ?? reportData?.reportDate ?? null;
}

function formatValidationItemContext(ctx) {
  const { item, article, rag } = ctx;
  const lines = [
    `Article key: ${item.article_key}`,
    `URL: ${item.article_url ?? 'n/a'}`,
    `Reasons: ${(item.reasons ?? []).map((r) => r.code).join(', ') || 'none'}`,
    `Signals: ${(item.signals ?? []).length}`,
  ];
  if (article?.excerpt) lines.push(`Excerpt: ${String(article.excerpt).slice(0, 400)}`);
  if (rag?.similar_articles?.length) {
    lines.push(`Similar: ${rag.similar_articles.slice(0, 3).map((a) => a.title).join('; ')}`);
  }
  return lines.join('\n');
}

function formatDriftSummary(data) {
  const alerts = (data.alerts ?? []).slice(0, 5);
  const overall = (data.overall_series ?? []).slice(-7);
  const lines = [
    `Scope: ${data.scope ?? 'national'}, days: ${data.days ?? 30}`,
    `Alerts (${alerts.length}): ${alerts.map((a) => a.message ?? a.type).join(' | ') || 'none'}`,
    `Recent overall scores: ${overall.map((p) => p.date + ':' + (p.score ?? '—')).join(', ')}`,
  ];
  return lines.join('\n');
}

async function handleProposeTool(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  if (!ctx.confirmActionsEnabled) {
    return 'Confirm-gated actions are disabled (CHAT_CONFIRM_ACTIONS_ENABLED=0).';
  }
  if (!ctx.pendingActionStore || !ctx.ownerUid || !ctx.sessionId) {
    return 'Pending action store not configured.';
  }

  let summary = '';
  if (toolName === 'propose_validation_decision') {
    const action = String(input?.action ?? '');
    if (!VALIDATION_ACTIONS.has(action)) {
      return `Invalid action "${action}". Allowed: ${[...VALIDATION_ACTIONS].join(', ')}`;
    }
    summary = `Validation: ${action} on ${input.date}/${input.article_key}`;
  } else if (toolName === 'propose_geo_unknown_update') {
    summary = `Geo unknown #${input.id} → ${input.status}`;
  } else if (toolName === 'propose_catalog_proposal_review') {
    summary = `Catalog proposal ${input.proposal_id} → ${input.status}`;
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
  let context = `Assessment date: ${assessment.date}\n`;
  context += includeScores
    ? `Overall score: ${assessment.overall_resilience_score}/10\n`
    : `${operatorAssessmentSummary(assessment)}\n`;
  context += `Executive summary: ${assessment.cross_component_synthesis?.slice(0, 2000) ?? 'N/A'}\n\n`;
  for (const component of assessment.components ?? []) {
    context += formatComponentBriefLine(component, includeScores);
  }
  return context;
}

function appendMunicipalityBriefContext(context, scope, municipality, pboLookup) {
  if (scope !== 'municipality' || !municipality) return context;
  let next = context;
  const muniData = pboLookup[municipality]
    ?? pboLookup[Object.keys(pboLookup).find((k) => k.includes(municipality) || municipality.includes(k))] ?? '';
  if (muniData) next += `\nPBO data for ${municipality}:\n${muniData}\n`;
  const signals = loadSignals({});
  const matches = searchSignals(signals, { municipality, limit: 15 });
  if (matches.length > 0) next += `\nRecent signals for ${municipality}:\n${formatSignals(matches)}\n`;
  return next;
}

async function generateBrief(input, reportData, pboLookup) {
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
  const langInstructions = language === 'he' ? 'Write the brief in Hebrew.' : 'Write the brief in English.';
  const scopeInstructions = scope === 'municipality'
    ? `Focus the brief on the municipality: ${municipality}.`
    : 'Produce an overall situation brief covering all components.';

  const response = await briefClient.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    system: 'You are a resilience assessment brief writer.',
    messages: [{
      role: 'user',
      content:
        `${audienceInstructions[audience] ?? audienceInstructions.analyst}\n` +
        `${langInstructions}\n${scopeInstructions}\n\nDATA:\n${briefContext}`,
    }],
  });
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return text || 'Brief generation returned empty.';
}

async function handleLookupPbo(input, ctx) {
  const muniName = input?.municipality ?? '';
  let result = ctx.pboLookup[muniName];
  if (!result) {
    const key = Object.keys(ctx.pboLookup).find(
      (k) => k.includes(muniName) || muniName.includes(k),
    );
    result = key ? ctx.pboLookup[key] : null;
  }
  return result ?? `No PBO data found for "${muniName}". Available: ${Object.keys(ctx.pboLookup).join(', ')}`;
}

function handleLookupSignals(input) {
  const signals = loadSignals({ date: input.date, sourceType: input.source_type });
  const matches = searchSignals(signals, {
    query: input.query,
    component: input.component,
    sourceType: input.source_type,
    municipality: input.municipality,
    limit: Math.min(input.limit ?? 10, 25),
  });
  return formatSignals(matches);
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
  return getSource(
    { ...input, source_id, date: inferredDate(input, ctx.reportData) },
    ctx.sourceArchive,
    ctx.evidenceStore,
  );
}

function handleSearchSources(input, ctx) {
  return searchSources(
    { ...input, date: inferredDate(input, ctx.reportData) },
    ctx.sourceArchive,
    ctx.retrievalService,
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

function handleGetResilienceDrift(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  const svc = ctx.driftService;
  if (!svc?.compute) return 'Drift service unavailable.';
  const data = svc.compute({
    scope: input.scope ?? 'national',
    days: Math.min(Math.max(input.days ?? 30, 1), 90),
    endDate: input.end_date ?? input.endDate ?? null,
  });
  return formatDriftSummary(data);
}

function handleListValidationQueue(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  const svc = ctx.validationReviewService;
  if (!svc?.listQueue) return 'Validation review unavailable.';
  const scope = normalizeReportScope(input.scope ?? 'national');
  const q = svc.listQueue(input.date, scope, { status: input.status ?? 'pending' });
  if (!q.items?.length) return `No validation items for ${input.date}/${scope}.`;
  return q.items.slice(0, 20).map((it) =>
    `- ${it.article_key}: ${(it.reasons ?? []).map((r) => r.code).join(', ') || 'review'}`,
  ).join('\n');
}

async function handleExplainValidationItem(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  const svc = ctx.validationReviewService;
  if (!svc?.explainItem) return 'Validation review unavailable.';
  const scope = normalizeReportScope(input.scope ?? 'national');
  const result = await svc.explainItem(
    input.date,
    scope,
    input.article_key,
    input.question ?? '',
  );
  if (!result) return `Item not found: ${input.article_key}`;
  return result.answer ?? 'No explanation returned.';
}

async function handleGetValidationItem(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  const svc = ctx.validationReviewService;
  if (!svc?.getItemContext) return 'Validation review unavailable.';
  const scope = normalizeReportScope(input.scope ?? 'national');
  const itemCtx = await svc.getItemContext(input.date, scope, input.article_key);
  if (!itemCtx) return `Item not found: ${input.article_key}`;
  return formatValidationItemContext(itemCtx);
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

async function handleListCatalogProposals(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  const svc = ctx.catalogProposalService;
  if (!svc?.listProposals) return 'Catalog proposal service unavailable.';
  const list = await svc.listProposals({ status: input.status ?? 'draft', limit: input.limit ?? 15 });
  if (!list.length) return 'No catalog proposals.';
  return list.map((p) =>
    `- ${p.id}: ${p.cluster_key} → ${p.proposal_json?.suggested_signal_type ?? '?'} [${p.status}]`,
  ).join('\n');
}

async function handleGetCatalogGapSummary(toolName, input, ctx) {
  const gate = requireAnalyst(ctx, toolName);
  if (gate) return gate;
  const svc = ctx.catalogProposalService;
  if (!svc?.getGapSummary) return 'Catalog proposal service unavailable.';
  const summary = await svc.getGapSummary({
    maxDays: input.max_days ?? 14,
    topN: input.top_n ?? 10,
  });
  const clusters = summary.clusters ?? [];
  if (!clusters.length) return `No OOV clusters in last ${summary.max_days ?? 14} days.`;
  return [
    `Total records: ${summary.total_records ?? 0}, clusters: ${clusters.length}`,
    ...clusters.map((c, i) => `${i + 1}. ${c.key} (n=${c.count}, priority=${c.priority_score})`),
  ].join('\n');
}

const CHAT_TOOL_HANDLERS = {
  lookup_pbo: (_toolName, input, ctx) => handleLookupPbo(input, ctx),
  lookup_signals: (_toolName, input) => handleLookupSignals(input),
  compare_dates: (_toolName, input, ctx) => handleCompareDates(input, ctx),
  generate_brief: (_toolName, input, ctx) => generateBrief(input, ctx.reportData, ctx.pboLookup),
  list_sources: (_toolName, input, ctx) => handleListSources(input, ctx),
  get_source: (_toolName, input, ctx) => handleGetSource(input, ctx),
  lookup_evidence: (_toolName, input, ctx) => handleGetSource(input, ctx),
  search_sources: (_toolName, input, ctx) => handleSearchSources(input, ctx),
  search_evidence: (_toolName, input, ctx) => handleSearchSources(input, ctx),
  search_pbo_history: handleSearchPboHistory,
  list_pbo_reviews: handleListPboReviews,
  get_pbo_review: handleGetPboReview,
  get_resilience_drift: handleGetResilienceDrift,
  list_validation_queue: handleListValidationQueue,
  get_validation_item: handleGetValidationItem,
  explain_validation_item: handleExplainValidationItem,
  list_geo_unknown: handleListGeoUnknown,
  list_catalog_proposals: handleListCatalogProposals,
  get_catalog_gap_summary: handleGetCatalogGapSummary,
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
  return handler(toolName, input, ctx);
}

export { generateBrief, buildAssessmentBriefContext };
