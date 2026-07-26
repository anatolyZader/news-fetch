/**
 * Chat LLM orchestration (app layer) — tool loop with Claude Haiku.
 */
import { getDefaultLlmPort, createAnthropicLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import {
  createAgentBudgetGovernor,
  createAgentKernel,
  chatMaxToolRounds,
  chatTemporalMaxToolRounds,
  chatSessionMaxUsd,
  chatCompactToolLoopEnabled,
  chatModel,
  HAIKU_MODEL,
} from '../../../cross-cut-modules/agent/index.js';
import { handleChatToolCall } from './chatToolHandlers.js';
import { createChatToolContext } from './createChatToolContext.js';
import { buildSystemTemplateToolList, describeChatToolCall } from '../domain/tools/chatToolSchemas.js';
import { chatAnalystToolsEnabled, chatConfirmActionsEnabled, chatStreamDeltasEnabled } from '../domain/chatConfig.js';
import { canViewAnalystDisplay } from '../../../cross-cut-modules/auth/userAccess.js';
import { UNTRUSTED_CONTENT_INSTRUCTION } from '../../../cross-cut-modules/security/index.js';
import { operatorEpistemicOverlayEnabled } from '../../resilience_scorer/index.js';
import { semanticOutputGate } from '../../../cross-cut-modules/security/domain/services/semanticOutputGate.js';

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
  let langLine = '- Answer in the same language the user writes in.\n';
  if (uiLang === 'he') {
    langLine = '- Always respond in Hebrew (UI language), regardless of the language the user writes in.\n';
  } else if (uiLang === 'ru') {
    langLine = '- Always respond in Russian (UI language), regardless of the language the user writes in.\n';
  }
  return (
    `You are an expert in Israeli community resilience (Home Front Command / פיקוד העורף framework). ` +
    `Help the user understand population resilience assessments and act on insights.\n\n` +
    `DEPTH MANDATE: The user already reads the report narratives on the site — a mere restatement adds nothing. ` +
    `Your value is depth: anchor every answer in the report's own key findings (its central statements, ` +
    `strongest figures, and named risks — these must appear, with their citations), then go beneath them into ` +
    `the layers the site does NOT render: the full evidence pool behind each component ` +
    `(get_component_evidence_bundle), raw signals (lookup_signals), verbatim source articles (get_source), ` +
    `counts (signal_stats), and movement across dates (compare_dates / trace_component_timeline). ` +
    `Report findings and deep-dive items complement each other — never replace one with the other.\n\n` +
    `TOOLS:\n${toolList}\n\n` +
    `GUIDELINES:\n` +
    (narrativeFocus
      ? '- Focus on component narratives and underlying evidence; use lookup_signals and get_source for quotes.\n'
      : '- Hub mode: for "what should I focus on" or operational priorities, call list_attention_items and get_decision_brief before answering.\n') +
    `- Never contradict instrument abstention (insufficient_data, sampling_blind, limited_evidence_neutral) in the report context.\n` +
    `- When asked about a specific component, answer from that component's narrative and evidence only — ` +
    `never attribute other components' or cross-component synthesis findings to it — and include the component's stated net assessment.\n` +
    `- Component-question structure: (1) THE REPORT'S ASSESSMENT — its net conclusion plus its 2–3 most ` +
    `important cited findings (key figures, named risks, notable evidence) with their citations; ` +
    `(2) BENEATH THE NARRATIVE — call get_component_evidence_bundle and surface 4–6 concrete evidence items ` +
    `the rendered report does not show, each with a short verbatim quote and its url or source_id; ` +
    `(3) quantify with signal_stats when scale matters; ` +
    `(4) note pool items that diverge from or are missing in the narrative; (5) data gaps.\n` +
    `- Epistemic roles in evidence pools: scored = backed the assessment; context_only / investigation_only = ` +
    `informative but not scored; quarantined = excluded by hygiene checks — you may surface these as additional leads ` +
    `but must label them "not part of the scored assessment".\n` +
    `- When citing findings, use lookup_signals for signal-level evidence; when source_id is present, call get_source for verbatim quotes.\n` +
    `- RETRIEVED CONTEXT in the system message lists source_id values — cite them and use get_source for exact quotes.\n` +
    `- Default to evidence-first answers: include a short quote and source_id or url when available.\n` +
    `- When the user asks "what changed" between two specific dates, use compare_dates.\n` +
    `- When the user asks how a component evolved across many dates (municipality + component + timeline), ` +
    `call trace_component_timeline once — do not use compare_dates as the primary answer.\n` +
    `- If the user says "not just two dates" or asks for all dates / throughout the war, use trace_component_timeline, not compare_dates.\n` +
    `- Never re-list available tools after the user stated a concrete question; execute tools and answer.\n` +
    `- If tools return empty, state what was searched (component, municipality, dates) and list available dates — ` +
    `do not revert to capability marketing.\n` +
    `- For temporal evolution answers use this structure: (1) Timeline by analyzed_at (date and time when known), ` +
    `(2) Phases early/mid/late, (3) 2–3 cited signals with source_id, (4) Data gaps.\n` +
    (narrativeFocus
      ? '- When the user asks for a summary or brief, use generate_brief or summarize from component narratives and signals.\n'
      : '- When the user asks for a summary or brief, use generate_brief or get_decision_brief as appropriate.\n') +
    (narrativeFocus
      ? '- For mutations (validation decisions, geo updates, catalog reviews), use propose_* tools only; tell the user to confirm in the UI.\n'
      : '- For mutations (validation decisions, geo updates, catalog reviews, operator recommendations), use propose_* tools only; tell the user to confirm in the UI.\n') +
    langLine +
    `\n` +
    `${UNTRUSTED_CONTENT_INSTRUCTION}\n\n` +
    `CONTEXT:\n`
  );
}

async function emitSemanticOutputGate(send, userIntentText, assistantText) {
  if (!assistantText.trim()) return;

  try {
    const verdict = await semanticOutputGate({
      leftText: userIntentText,
      rightText: assistantText,
    });
    if (verdict?.enabled) {
      send({
        type: 'semantic_output_gate',
        ok: verdict.ok,
        similarity: verdict.similarity,
        threshold: verdict.threshold,
        reason: verdict.reason,
      });
    }
  } catch {
    // Gate failures must not break chat.
  }
}

export async function streamChatResponse(systemContext, pboLookup, messages, send, reportData, opts = {}) {
  const costRecorder = opts.costRecorder ?? null;
  const economyOverride = opts.economy?.economy_override ?? 'default';
  // Hybrid router: chatService resolves the model from the context slice;
  // direct callers without economy meta fall back to the base chat model.
  const model = opts.economy?.model ?? chatModel();
  const toolCtx = createChatToolContext({
    resolvedModel: model,
    userEmail: opts.userEmail ?? '',
    reportData,
    redactReportPayload: opts.redactReportPayload ?? null,
    pboLookup,
    sourceArchive: opts.sourceArchive ?? null,
    evidenceStore: opts.evidenceStore ?? null,
    retrievalService: opts.retrievalService ?? null,
    retrievalCache: opts.retrievalCache ?? null,
    costRecorder,
    pboHistoricalSearchService: opts.pboHistoricalSearchService ?? null,
    pboReportReviewService: opts.pboReportReviewService ?? null,
    getMunicipalityDashboard: opts.getMunicipalityDashboard ?? null,
    geoUnknownReviewService: opts.geoUnknownReviewService ?? null,
    pendingActionStore: opts.pendingActionStore ?? null,
    ownerUid: opts.ownerUid ?? '',
    sessionId: opts.sessionId ?? '',
    onActionProposed: (event) => send(event),
    onCitation: (payload) => send({ type: 'citation', tool: payload.tool, citations: payload.citations }),
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
  const contextSlice = opts.economy?.context_slice ?? 'standard';
  const maxToolRounds = contextSlice === 'temporal'
    ? chatTemporalMaxToolRounds()
    : chatMaxToolRounds();
  const budget = opts.budget ?? createAgentBudgetGovernor({
    maxUsd: chatSessionMaxUsd(),
    maxToolRounds,
  });

  const lastUser = Array.isArray(messages)
    ? [...messages].reverse().find((m) => m?.role === 'user')
    : null;
  const userIntentText = typeof lastUser?.content === 'string'
    ? lastUser.content
    : String(lastUser?.content ?? '');
  let assistantText = '';
  // The model rarely puts whitespace between the text it wrote before a tool
  // round and the text it writes after — inject a paragraph break at that seam.
  let toolRoundSinceText = false;
  const emitText = (t) => {
    if (!t) return;
    if (toolRoundSinceText && assistantText && !/\s$/.test(assistantText) && !/^\s/.test(t)) {
      assistantText += '\n\n';
      send({ type: 'text', text: '\n\n' });
    }
    toolRoundSinceText = false;
    assistantText += t;
    send({ type: 'text', text: t });
  };

  const loopResult = await agentKernel.run({
    profile: 'chat',
    agentKind: 'chat',
    model,
    maxTokens: 4000,
    maxRounds: maxToolRounds,
    retryModelCall: { retries: 2 },
    // Chat tools are independent reads — a multi-tool round runs them
    // concurrently (CHAT_PARALLEL_TOOLS=0 to fall back to sequential).
    parallelToolCalls: process.env.CHAT_PARALLEL_TOOLS !== '0',
    system,
    messages,
    tools: toolCtx.tools,
    executeTool: (name, input) => handleChatToolCall(name, input, toolCtx),
    ...(chatStreamDeltasEnabled()
      ? { onTextDelta: (delta) => emitText(String(delta ?? '')) }
      : { onTextBlock: (text) => emitText(String(text ?? '')) }),
    agentKernel: opts.agentKernel ?? null,
    abortSignal: opts.abortSignal ?? null,
    compactHistoryAfterRound: compactToolLoop,
    budget,
    onUsage: costRecorder
      ? (p) => costRecorder.onUsage({ label: p.label, model: p.model, usage: p.usage })
      : undefined,
    onToolStart: ({ name, round, maxRounds, input }) => {
      toolRoundSinceText = true;
      const detail = describeChatToolCall(input);
      send({ type: 'tool_start', name, round, maxRounds, ...(detail ? { detail } : {}) });
    },
  });

  if (opts.onLoopExhausted && loopResult?.stopReason === 'max_rounds') {
    opts.onLoopExhausted({ stopReason: loopResult.stopReason, runId: loopResult.runId, traceId: loopResult.traceId });
  }

  await emitSemanticOutputGate(send, userIntentText, assistantText);

  return { assistantText, stopReason: loopResult?.stopReason ?? null };
}

export async function generateChatTitle(seedText, opts = {}) {
  const text = String(seedText ?? '').trim();
  if (!text) return null;
  const model = HAIKU_MODEL;
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

const FOLLOWUP_LANG_LINES = {
  he: 'Write the questions in Hebrew.',
  ru: 'Write the questions in Russian.',
};

/**
 * Cheap post-answer follow-up suggestions (always Haiku — a 3-line JSON array
 * is not worth the strong model). Returns up to 3 short strings, or [].
 */
export async function generateChatFollowups({ question, answer, uiLang }, opts = {}) {
  const q = String(question ?? '').trim();
  const a = String(answer ?? '').trim();
  if (!q || !a) return [];
  const langLine = FOLLOWUP_LANG_LINES[String(uiLang ?? '').toLowerCase()]
    ?? 'Write the questions in the same language as the user\'s question.';
  const model = HAIKU_MODEL;
  const response = await getDefaultLlmPort().createMessage({
    model,
    max_tokens: 250,
    system:
      'You suggest follow-up questions for a resilience-assessment chat. ' +
      'Return ONLY a JSON array of 3 short, concrete follow-up questions (each under 90 characters) ' +
      'that dig deeper into evidence, timelines, components, or municipalities. ' +
      `No prose outside the JSON array. ${langLine}`,
    messages: [{
      role: 'user',
      content:
        `USER QUESTION:\n${q.slice(0, 600)}\n\n` +
        `ASSISTANT ANSWER (tail):\n${a.slice(-1200)}`,
    }],
  });
  if (opts.costRecorder && response.usage) {
    opts.costRecorder.onUsage({ label: 'chat:followups', model, usage: response.usage });
  }
  const text = response.content?.filter((b) => b.type === 'text').map((b) => b.text).join('') ?? '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => typeof s === 'string' && s.trim())
      .slice(0, 3)
      .map((s) => s.trim().slice(0, 120));
  } catch {
    return [];
  }
}

/**
 * Rolling conversation summary (always Haiku). Folds older turns into a
 * compact brief so long chats keep their early context instead of losing it
 * to the hard history cutoff.
 */
export async function generateChatSummary({ previousSummary, transcript }, opts = {}) {
  const body = String(transcript ?? '').trim();
  if (!body) return null;
  const model = HAIKU_MODEL;
  const response = await getDefaultLlmPort().createMessage({
    model,
    max_tokens: 600,
    system:
      'You maintain a rolling summary of a resilience-assessment chat conversation. ' +
      'Produce a compact brief (under 250 words) that preserves: the user\'s goals and constraints, ' +
      'key findings and figures already established, source_ids and dates already cited, ' +
      'components/municipalities discussed, and open threads. ' +
      'Merge the previous summary with the new turns; drop pleasantries. Plain text only.',
    messages: [{
      role: 'user',
      content:
        (previousSummary ? `PREVIOUS SUMMARY:\n${String(previousSummary).slice(0, 2500)}\n\n` : '') +
        `NEW TURNS TO FOLD IN:\n${body.slice(0, 8000)}`,
    }],
  });
  if (opts.costRecorder && response.usage) {
    opts.costRecorder.onUsage({ label: 'chat:summary', model, usage: response.usage });
  }
  const text = response.content?.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return text || null;
}
