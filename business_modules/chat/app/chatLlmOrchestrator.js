/**
 * Chat LLM orchestration (app layer) — tool loop with Claude Haiku.
 */
import { getDefaultLlmPort, createAnthropicLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { createAgentKernel, chatMaxToolRounds, chatCompactToolLoopEnabled, HAIKU_MODEL } from '../../../cross-cut-modules/agent/index.js';
import { handleChatToolCall } from './chatToolHandlers.js';
import { createChatToolContext } from './createChatToolContext.js';
import { buildSystemTemplateToolList } from '../domain/tools/chatToolSchemas.js';
import { chatAnalystToolsEnabled, chatConfirmActionsEnabled } from '../domain/chatConfig.js';
import { canViewAnalystDisplay } from '../../../cross-cut-modules/auth/userAccess.js';
import { UNTRUSTED_CONTENT_INSTRUCTION } from '../../../cross-cut-modules/security/index.js';
import { operatorEpistemicOverlayEnabled } from '../../../cross-cut-modules/resilience-contracts/operatorEpistemicOverlay.js';

function buildSystemTemplate(ctx) {
  const isAnalyst = canViewAnalystDisplay(ctx.userEmail ?? '');
  const narrativeFocus = !operatorEpistemicOverlayEnabled() && !isAnalyst;
  const uiLang = String(ctx.uiLang ?? 'en').trim().toLowerCase();
  const toolList = buildSystemTemplateToolList({
    analystToolsEnabled: chatAnalystToolsEnabled(),
    isAnalyst,
    confirmActionsEnabled: chatConfirmActionsEnabled(),
    toolProfile: ctx.toolProfile ?? 'default',
  });
  const validationNote =
    ctx.toolProfile === 'validation'
      ? '- Validation mode: focus on queue items and evidence; use propose_validation_decision after investigation (user must confirm).\n'
      : '';
  let langLine = '- Answer in the same language the user writes in.\n';
  if (uiLang === 'he') {
    langLine = '- Always respond in Hebrew (UI language), regardless of the language the user writes in.\n';
  } else if (uiLang === 'ru') {
    langLine = '- Always respond in Russian (UI language), regardless of the language the user writes in.\n';
  }
  return (
    `You are an expert in Israeli community resilience (Home Front Command / פיקוד העורף framework). ` +
    `Help the user understand population resilience assessments and act on insights.\n\n` +
    `TOOLS:\n${toolList}\n\n` +
    `GUIDELINES:\n` +
    validationNote +
    (narrativeFocus
      ? '- Focus on component narratives and underlying evidence; use lookup_signals and get_source for quotes.\n'
      : '- Hub mode: for "what should I focus on" or operational priorities, call list_attention_items and get_decision_brief before answering.\n') +
    `- Never contradict instrument abstention (insufficient_data, sampling_blind, limited_evidence_neutral) in the report context.\n` +
    `- When citing findings, use lookup_signals for signal-level evidence; when source_id is present, call get_source for verbatim quotes.\n` +
    `- RETRIEVED CONTEXT in the system message lists source_id values — cite them and use get_source for exact quotes.\n` +
    `- Default to evidence-first answers: include a short quote and source_id or url when available.\n` +
    `- When the user asks "what changed", use compare_dates.\n` +
    (narrativeFocus
      ? '- When the user asks for a summary or brief, use generate_brief or summarize from component narratives and signals.\n'
      : '- When the user asks for a summary or brief, use generate_brief or get_decision_brief as appropriate.\n') +
    `- Validation investigate: use get_validation_item, search_similar_articles, then propose_validation_decision after review (user must confirm).\n` +
    (narrativeFocus
      ? '- For mutations (validation decisions, geo updates, catalog reviews), use propose_* tools only; tell the user to confirm in the UI.\n'
      : '- For mutations (validation decisions, geo updates, catalog reviews, operator recommendations), use propose_* tools only; tell the user to confirm in the UI.\n') +
    langLine +
    `\n` +
    `${UNTRUSTED_CONTENT_INSTRUCTION}\n\n` +
    `CONTEXT:\n`
  );
}

export async function streamChatResponse(systemContext, pboLookup, messages, send, reportData, opts = {}) {
  const costRecorder = opts.costRecorder ?? null;
  const economyOverride = opts.economy?.economy_override ?? 'default';
  const toolCtx = createChatToolContext({
    userEmail: opts.userEmail ?? '',
    reportData,
    pboLookup,
    sourceArchive: opts.sourceArchive ?? null,
    evidenceStore: opts.evidenceStore ?? null,
    retrievalService: opts.retrievalService ?? null,
    retrievalCache: opts.retrievalCache ?? null,
    costRecorder,
    validationReviewService: opts.validationReviewService ?? null,
    pboHistoricalSearchService: opts.pboHistoricalSearchService ?? null,
    pboReportReviewService: opts.pboReportReviewService ?? null,
    driftService: opts.driftService ?? null,
    catalogProposalService: opts.catalogProposalService ?? null,
    geoUnknownReviewService: opts.geoUnknownReviewService ?? null,
    pendingActionStore: opts.pendingActionStore ?? null,
    ownerUid: opts.ownerUid ?? '',
    sessionId: opts.sessionId ?? '',
    onActionProposed: (event) => send(event),
    toolProfile: opts.toolProfile ?? 'default',
    economyOverride,
    uiLang: opts.uiLang ?? 'en',
  });

  const system = {
    stable: buildSystemTemplate(toolCtx),
    dynamic: systemContext,
  };

  const llmPort = opts.llmPort ?? (opts.client ? createAnthropicLlmPort({ client: opts.client }) : getDefaultLlmPort());
  const agentKernel = opts.agentKernel ?? createAgentKernel({ llmPort });
  const compactToolLoop = opts.economy?.compact_tool_loop ?? chatCompactToolLoopEnabled();

  await agentKernel.run({
    profile: 'chat',
    agentKind: 'chat',
    model: HAIKU_MODEL,
    maxTokens: 4000,
    maxRounds: chatMaxToolRounds(),
    system,
    messages,
    tools: toolCtx.tools,
    executeTool: (name, input) => handleChatToolCall(name, input, toolCtx),
    onTextBlock: (text) => send({ type: 'text', text }),
    agentKernel: opts.agentKernel ?? null,
    abortSignal: opts.abortSignal ?? null,
    compactHistoryAfterRound: compactToolLoop,
    onUsage: costRecorder
      ? (p) => costRecorder.onUsage({ label: p.label, model: p.model, usage: p.usage })
      : undefined,
  });
}

export async function generateChatTitle(seedText, opts = {}) {
  const text = String(seedText ?? '').trim();
  if (!text) return null;
  const model = 'claude-haiku-4-5-20251001';
  const response = await getDefaultLlmPort().createMessage({
    model,
    max_tokens: 24,
    system:
      'You create short chat titles. ' +
      'Return ONLY a concise title (2–5 words). No quotes. No punctuation at end.',
    messages: [{
      role: 'user',
      content:
        'Create a short title for this chat based on the first message.\n\n' +
        `MESSAGE:\n${text.slice(0, 500)}`,
    }],
  });
  if (opts.costRecorder && response.usage) {
    opts.costRecorder.onUsage({
      label: 'chat:title',
      model,
      usage: response.usage,
    });
  }
  const block = response.content?.find((b) => b.type === 'text');
  return block?.text?.trim() || null;
}
