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
  listReportDatesByScope,
  listSignalDatesBySourceType,
  listPboDates,
  loadObservations,
  signalStats,
  getSignalById,
  formatFullSignal,
} from '../domain/signalLookup.js';
import { describeSignalType } from '../domain/signalTypeInfo.js';
import { searchReports } from '../domain/reportSearch.js';
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
import { requireRichTools } from './createChatToolContext.js';
import {
  PROPOSE_TOOL_NAMES,
  OPERATOR_PROPOSE_TOOL_NAMES,
  SIGNAL_FLAG_REASONS,
  chatCompressToolsEnabled,
} from '../domain/chatConfig.js';
import { compressChatToolResult } from '../domain/chatToolCompress.js';
import { extractCitationsFromToolResult } from '../domain/chatCitations.js';
import { wrapToolResultIfUntrusted, wrapUntrustedBlock } from '../../../cross-cut-modules/security/index.js';
import { buildComponentTimeline, formatComponentTimeline, getCachedDashboard } from '../domain/traceComponentTimeline.js';
import { resolveMunicipalityName, findMunicipalityInDay } from '../domain/municipalityResolve.js';
import { buildPboIndex } from '../domain/pboIndex.js';


function inferredDate(input, reportData) {
  return input?.date ?? reportData?.assessment?.date ?? reportData?.reportDate ?? null;
}

async function handleProposeTool(toolName, input, ctx) {
  const isOperatorPropose = OPERATOR_PROPOSE_TOOL_NAMES.has(toolName);
  if (!isOperatorPropose) {
    const gate = requireRichTools(ctx, toolName);
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
  } else if (toolName === 'propose_signal_flag') {
    const reason = String(input?.reason ?? '');
    if (!SIGNAL_FLAG_REASONS.has(reason)) {
      return `Invalid reason. Use one of: ${[...SIGNAL_FLAG_REASONS].join(', ')}.`;
    }
    const ref = String(input?.signal_id ?? input?.source_ref ?? '').trim();
    if (!ref) return 'Provide signal_id (from lookup_signals) or source_ref.';
    summary = `Flag signal ${ref}: ${reason}`;
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

async function generateBrief(input, reportData, pboLookup, costRecorder = null, model = HAIKU_MODEL) {
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

function lookupInPboIndex(lookup, muniName) {
  const resolved = resolveMunicipalityName(muniName, { pboLookupKeys: Object.keys(lookup) });
  return lookup[muniName] ?? (resolved ? lookup[resolved] : null);
}

function formatDashboardMunicipality(dashboard, day, muni) {
  const order = dashboard.componentsOrder ?? Object.keys(muni.components ?? {});
  const lines = [];
  for (const cid of order) {
    const comp = muni.components?.[cid];
    if (comp?.avg == null) continue;
    const pct = Math.round(comp.avg * 100);
    const texts = (comp.texts ?? []).slice(0, 2).join(' | ');
    const textPart = texts ? ` — ${texts}` : '';
    lines.push(`- ${cid}: ${pct}%${textPart}`);
  }
  return lines.join('\n') || '(no component scores recorded that day)';
}

function lookupPboFromDashboard(dashboard, muniName, { requestedDate, reportDate }) {
  const days = dashboard?.days ?? [];
  if (days.length === 0) return null;
  const targetDate = requestedDate ?? reportDate;

  const exactDay = targetDate ? days.find((d) => d.date === targetDate) : null;
  if (exactDay) {
    const muni = findMunicipalityInDay(exactDay, muniName);
    if (muni) {
      return (
        `PBO data for "${muni.name}" (PBO report date ${exactDay.date} — state this date when answering):\n` +
        formatDashboardMunicipality(dashboard, exactDay, muni)
      );
    }
    return (
      `No PBO data for "${muniName}" on ${exactDay.date}. ` +
      `Municipalities with PBO data that day: ${exactDay.municipalities.map((m) => m.name).join(', ')}`
    );
  }

  if (!requestedDate) {
    // No explicit date and none for the loaded report date — serve the latest
    // collection containing this municipality, honestly labeled.
    for (let i = days.length - 1; i >= 0; i--) {
      const muni = findMunicipalityInDay(days[i], muniName);
      if (muni) {
        return (
          `PBO data for "${muni.name}" — last collected ${days[i].date}, NOT current; state this date when answering:\n` +
          formatDashboardMunicipality(dashboard, days[i], muni)
        );
      }
    }
  }

  return (
    `No PBO data for "${muniName}" on ${targetDate ?? 'any covered date'}. ` +
    `PBO reports exist only for: ${days.map((d) => d.date).join(', ')}. ` +
    `Known municipalities: ${(dashboard.municipalities ?? []).slice(0, 40).join(', ')}`
  );
}

/**
 * PBO data is served only for dates a PBO report was actually produced.
 * Canonical source: the municipality dashboard (parsed from officer Excel
 * files). Fallbacks: the loaded report's embedded index, then on-disk PBO
 * signal bundles — every answer labeled with its true collection date.
 */
async function handleLookupPbo(input, ctx) {
  const muniName = input?.municipality ?? '';
  const requestedDate = String(input?.date ?? '').trim() || null;
  const reportDate = ctx.reportData?.assessment?.date ?? null;

  const dashboard = getCachedDashboard(ctx.getMunicipalityDashboard);
  const fromDashboard = dashboard
    ? lookupPboFromDashboard(dashboard, muniName, { requestedDate, reportDate })
    : null;
  if (fromDashboard) return fromDashboard;

  if (!requestedDate || requestedDate === reportDate) {
    const hit = lookupInPboIndex(ctx.pboLookup, muniName);
    if (hit) return hit;
  }

  const targetDate = requestedDate ?? reportDate;
  if (targetDate) {
    const pboSignals = loadSignals({ sourceType: 'pbo', date: targetDate });
    if (pboSignals.length > 0) {
      const { lookup } = buildPboIndex(pboSignals);
      const hit = lookupInPboIndex(lookup, muniName);
      if (hit) {
        return `PBO data for "${muniName}" (PBO report date ${targetDate} — state this date when answering):\n${hit}`;
      }
      return (
        `No PBO data for "${muniName}" on ${targetDate}. ` +
        `Municipalities with PBO data that day: ${Object.keys(lookup).join(', ')}`
      );
    }
  }

  const pboDates = listPboDates();
  return (
    `No PBO data for "${muniName}" on ${targetDate ?? 'the loaded report date'}. ` +
    (pboDates.length > 0
      ? `PBO reports exist only for: ${pboDates.join(', ')}. Re-run lookup_pbo with date set to one of these.`
      : 'No PBO signal bundles exist on disk.')
  );
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
    signalType: input.signal_type,
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
    richTools: ctx.richTools,
    getMunicipalityDashboard: ctx.getMunicipalityDashboard ?? null,
    pboReportReviewService: ctx.pboReportReviewService ?? null,
  });
  return formatComponentTimeline(result);
}

function handleCompareDates(input, ctx) {
  const includeScores = ctx.reportData?.display_view === DISPLAY_VIEWS.analyst;
  // Default to the loaded report's scope so a north session compares north reports.
  const scope = normalizeReportScope(
    String(input?.scope ?? ctx.reportData?.assessment?.report_scope?.id ?? 'national'),
  );
  const component = String(input?.component ?? '').trim() || null;
  return compareReports(input.date_a, input.date_b, { includeScores, scope, component });
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
  const gate = requireRichTools(ctx, toolName);
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
  const gate = requireRichTools(ctx, toolName);
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
  const gate = requireRichTools(ctx, toolName);
  if (gate) return gate;
  const svc = ctx.pboReportReviewService;
  if (!svc?.getReviewDetail) return 'PBO review service unavailable.';
  const detail = await svc.getReviewDetail(input.date, input.municipality);
  if (!detail) return `No review for ${input.municipality} on ${input.date}.`;
  return JSON.stringify(detail, null, 2).slice(0, 8000);
}

function handleListGeoUnknown(toolName, input, ctx) {
  const gate = requireRichTools(ctx, toolName);
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
  if (!items.length) return 'No attention items — nothing was flagged for this assessment (the attention layer did run).';
  return items.map((it) => {
    const componentPart = it.component_id ? ` component=${it.component_id}` : '';
    const titlePart = it.title_key ? ` title=${it.title_key}` : '';
    return `- [${it.id}] ${it.level} ${it.code}${componentPart}${titlePart}`;
  }).join('\n');
}

function handleListOperatorRecommendations(_toolName, input, ctx) {
  const a = ctx.reportData?.assessment;
  if (!a) return 'No assessment loaded.';
  if (a.operator_recommendations === undefined) {
    return 'Operator recommendations were not generated for this report (feature off at assess time).';
  }
  const statusFilter = input?.status ?? 'pending';
  let recs = a.operator_recommendations ?? [];
  if (statusFilter !== 'all') {
    recs = recs.filter((r) => r.status === statusFilter);
  }
  if (!recs.length) return `No operator recommendations with status=${statusFilter} — the layer ran, none matched.`;
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
  const scope = normalizeReportScope(
    String(input?.scope ?? ctx.reportData?.assessment?.report_scope?.id ?? 'national'),
  );
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

/**
 * Resolve the report a tool should operate on: the loaded (today's) report by
 * default, or a past report from disk when input.date is set. Past reports come
 * raw off disk, so the live report's operator redaction is re-applied.
 * @returns {{ reportData?: object|null, error?: string }}
 */
function resolveReportDataForDate(input, ctx) {
  const date = String(input?.date ?? '').trim();
  if (!date) return { reportData: ctx.reportData };
  const scope = normalizeReportScope(
    String(input?.scope ?? ctx.reportData?.assessment?.report_scope?.id ?? 'national'),
  );
  const report = loadReport(date, scope);
  if (!report?.assessment) {
    return { error: `No report found for ${date} (scope=${scope}). Available dates: ${listReportDates().join(', ')}` };
  }
  if (ctx.reportData?.display_view !== DISPLAY_VIEWS.analyst && ctx.redactReportPayload) {
    return { reportData: ctx.redactReportPayload(report, DISPLAY_VIEWS.operator) };
  }
  return { reportData: report };
}

function handleGetReportContext(_toolName, input, ctx) {
  const resolved = resolveReportDataForDate(input, ctx);
  if (resolved.error) return resolved.error;
  const reportData = resolved.reportData;
  if (!reportData) return 'No report loaded.';
  const slice = REPORT_CONTEXT_SLICES.has(input?.slice) ? input.slice : 'standard';
  const componentId = String(input?.component ?? '').trim() || undefined;
  const includeScores = ctx.reportData?.display_view === DISPLAY_VIEWS.analyst;
  const { context } = buildReportContext(reportData, {
    includeScores,
    contextSlice: slice,
    componentId,
  });
  return context;
}

function handleListObservations(toolName, input, ctx) {
  const gate = requireRichTools(ctx, toolName);
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
  const resolved = resolveReportDataForDate(input, ctx);
  if (resolved.error) return resolved.error;
  return formatComponentEvidenceBundle(resolved.reportData, componentId, {
    role: input?.role ?? null,
    limit: input?.limit ?? 50,
  });
}

function nextDay(d) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

/** Collapse a sorted date list into compact runs: "2026-06-01…2026-06-14 (14)". */
function collapseDateRuns(dates) {
  if (!dates?.length) return '(none)';
  const runs = [];
  let runStart = dates[0];
  let prev = dates[0];
  let count = 1;
  const flush = () => {
    runs.push(runStart === prev ? runStart : `${runStart}…${prev} (${count})`);
  };
  for (const d of dates.slice(1)) {
    if (d === nextDay(prev)) {
      prev = d;
      count += 1;
      continue;
    }
    flush();
    runStart = d;
    prev = d;
    count = 1;
  }
  flush();
  return runs.join(', ');
}

function formatCoverageRows(byKey, emptyLabel) {
  const keys = Object.keys(byKey).sort((a, b) => a.localeCompare(b));
  if (keys.length === 0) return [emptyLabel];
  return keys.map((k) => `- ${k}: ${collapseDateRuns(byKey[k])}`);
}

function handleGetDataCoverage(_toolName, _input, ctx) {
  const dashboard = getCachedDashboard(ctx.getMunicipalityDashboard);
  const dashboardDates = [...new Set((dashboard?.days ?? []).map((d) => d.date).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const sections = [
    'Report dates by scope:',
    ...formatCoverageRows(listReportDatesByScope(), '- (no reports on disk)'),
    '',
    'Signal dates by source type:',
    ...formatCoverageRows(listSignalDatesBySourceType(), '- (no signal bundles on disk)'),
    '',
    'PBO collections:',
    `- signal bundles: ${collapseDateRuns(listPboDates())}`,
    `- dashboard days: ${collapseDateRuns(dashboardDates)}`,
  ];
  return sections.join('\n');
}

function topCountRows(items, keyFn, cap = 15) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, cap)
    .map(([k, n]) => `- ${k}: ${n}`);
}

function buildMunicipalityPboSection(dashboard, resolved, ctx) {
  const days = dashboard?.days ?? [];
  const coveredDates = [];
  let latestDay = null;
  let latestMuni = null;
  for (const day of days) {
    const muni = findMunicipalityInDay(day, resolved);
    if (!muni) continue;
    if (day.date) coveredDates.push(day.date);
    latestDay = day;
    latestMuni = muni;
  }
  if (latestDay && latestMuni) {
    return (
      `PBO data for "${latestMuni.name}" — last collected ${latestDay.date}, NOT current; state this date when answering:\n` +
      `${formatDashboardMunicipality(dashboard, latestDay, latestMuni)}\n` +
      `PBO dates covered: ${coveredDates.sort((a, b) => a.localeCompare(b)).join(', ')}`
    );
  }
  const indexHit = lookupInPboIndex(ctx.pboLookup ?? {}, resolved);
  return indexHit ?? '(no PBO data for this municipality)';
}

async function handleGetMunicipalityProfile(input, ctx) {
  const raw = String(input?.municipality ?? '').trim();
  if (!raw) return 'municipality is required';

  const dashboard = getCachedDashboard(ctx.getMunicipalityDashboard);
  const resolved = resolveMunicipalityName(raw, {
    pboLookupKeys: dashboard?.municipalities ?? Object.keys(ctx.pboLookup ?? {}),
  }) ?? raw;

  const pboSection = buildMunicipalityPboSection(dashboard, resolved, ctx);

  const signals = loadSignals({ dateFrom: input?.date_from, dateTo: input?.date_to });
  const matches = searchSignals(signals, { municipality: raw, limit: Number.MAX_SAFE_INTEGER });

  const noPbo = pboSection.startsWith('(no PBO data');
  if (noPbo && matches.length === 0) {
    return (
      `No PBO data or signals found for "${raw}". ` +
      `Known municipalities: ${(dashboard?.municipalities ?? []).slice(0, 40).join(', ')}`
    );
  }

  const resolvedNote = resolved === raw ? '' : ` (resolved from "${raw}")`;
  const sections = [`Municipality profile: ${resolved}${resolvedNote}`, '', pboSection];
  if (matches.length === 0) {
    sections.push('', 'Signals: none matched for this municipality (in the requested date range).');
  } else {
    const recentLimit = Math.min(Math.max(Number(input?.limit ?? 5) || 5, 1), 10);
    sections.push(
      '',
      `Signal counts by type (${matches.length} total):`,
      ...topCountRows(matches, (s) => String(s.signal_type ?? 'unknown')),
      '',
      'Signal counts by source:',
      ...topCountRows(matches, (s) => String(s.source_type ?? 'unknown')),
      '',
      `Latest ${Math.min(recentLimit, matches.length)} signals:`,
      formatSignals(matches.slice(0, recentLimit)),
    );
  }
  return sections.join('\n');
}

function handleSearchReports(_toolName, input, ctx) {
  const redact = ctx.reportData?.display_view !== DISPLAY_VIEWS.analyst && ctx.redactReportPayload
    ? (report) => ctx.redactReportPayload(report, DISPLAY_VIEWS.operator)
    : undefined;
  return searchReports(input ?? {}, {
    redact,
    // Test / composition overrides — production leaves these unset.
    reportsDir: ctx.reportsDir,
    stateStore: ctx.stateStore,
  });
}

function handleGetSignal(_toolName, input) {
  const { signal, error } = getSignalById(String(input?.signal_id ?? '').trim());
  if (error) return `${error} Use lookup_signals to find valid signal ids.`;
  return formatFullSignal(signal);
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
      // Follow the routed chat model so upgrading chat also upgrades briefs.
      ctx.resolvedModel ?? chatModel(),
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
  get_data_coverage: handleGetDataCoverage,
  describe_signal_type: (_toolName, input) => describeSignalType(input?.signal_type ?? ''),
  get_municipality_profile: (_toolName, input, ctx) => handleGetMunicipalityProfile(input, ctx),
  search_reports: handleSearchReports,
  get_signal: handleGetSignal,
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
    strongModel: (ctx.resolvedModel ?? chatModel()) !== HAIKU_MODEL,
  });
  return wrapToolResultIfUntrusted(toolName, compressed);
}

export { generateBrief, buildAssessmentBriefContext, CHAT_TOOL_HANDLERS };
