/**
 * Chat application service — orchestrates report context and Claude streaming.
 */
import { buildReportContext } from '../domain/reportContext.js';
import {
  resolveChatContextTier,
  resolveChatEconomyMode,
} from '../domain/chatContextTier.js';
import { chatFollowupSuggestionsEnabled } from '../domain/chatConfig.js';
import { collectCitationEvent, partitionCitationsByUse } from '../domain/chatCitations.js';
import { resolveChatModel } from '../../../cross-cut-modules/agent/index.js';
import { runDeterministicChatFallback } from './chatDeterministicFallback.js';
import { ragPipelineEnabled } from '../../../cross-cut-modules/retrieval/index.js';
import { reportIndexHelpers } from '../../../cross-cut-modules/retrieval/reportIndexHelpers.js';
import { METRIC } from '../../../cross-cut-modules/monitoring/domain/metricNames.js';
import { DISPLAY_VIEWS } from '../../resilience_scorer/index.js';

const MAX_HISTORY_MESSAGES = 20;

function chatReportData(raw, redactReportPayload) {
  if (!raw) return raw;
  if (raw.display_view === DISPLAY_VIEWS.developer) return raw;
  if (!redactReportPayload) return raw;
  return redactReportPayload(raw, DISPLAY_VIEWS.user);
}

function throwIfAborted(abortSignal) {
  if (!abortSignal?.aborted) return;
  const reason = abortSignal.reason;
  const message = reason instanceof Error ? reason.message : String(reason ?? 'Chat request aborted');
  const err = new Error(message);
  err.name = 'AbortError';
  throw err;
}

function buildChatToolContextDeps(opts) {
  return {
    userEmail: opts.userEmail ?? '',
    redactReportPayload: opts.redactReportPayload ?? null,
    sourceArchive: opts.sourceArchive ?? null,
    evidenceStore: opts.evidenceStore ?? null,
    retrievalService: opts.retrievalService ?? null,
    retrievalCache: opts.retrievalCache ?? null,
    toolProfile: opts.toolProfile ?? 'default',
    getMunicipalityDashboard: opts.getMunicipalityDashboard ?? null,
    pboReportReviewService: opts.pboReportReviewService ?? null,
  };
}

async function sendDeterministicFallback(send, {
  message,
  reportData,
  pboLookup,
  sliceResult,
  toolContextDeps,
  doneMeta,
  errorDoneMeta,
}) {
  try {
    const fallbackText = await runDeterministicChatFallback({
      message,
      reportData,
      pboLookup,
      contextSlice: sliceResult.contextSlice,
      contextSliceReason: sliceResult.reason,
      componentId: sliceResult.componentId,
      toolContextDeps,
    });
    send({ type: 'text', text: fallbackText });
    send({ type: 'done', mode: 'deterministic_fallback', ...doneMeta });
  } catch (err) {
    send({ type: 'error', message: err?.message ?? 'Deterministic fallback failed' });
    send({ type: 'done', error: true, ...errorDoneMeta });
  }
}

function recordChatEconomyUsage(costRecorder, chatEconomyMeta, contextLength) {
  if (!costRecorder) return;
  costRecorder.onUsage({
    label: 'http:chat',
    stage: 'chat_economy',
    stats: {
      context_slice: chatEconomyMeta.context_slice,
      compact_tool_loop: chatEconomyMeta.compact_tool_loop,
      context_chars: contextLength,
      context_slicing_enabled: chatEconomyMeta.context_slicing_enabled,
      economy_override: chatEconomyMeta.economy_override,
      context_slice_reason: chatEconomyMeta.context_slice_reason,
    },
  });
}

async function runStreamChatLlm({
  chatLlmPort,
  context,
  pboLookup,
  messages,
  send,
  reportData,
  opts,
  chatEconomyMeta,
  abortSignal,
  tracePort,
  message,
  turnCitations,
}) {
  let loopExhausted = false;
  let streamResult = null;
  const runLlm = async () => {
    streamResult = await chatLlmPort.streamChatResponse(
      context,
      pboLookup,
      messages,
      send,
      reportData,
      buildChatLlmStreamOptions(opts, {
        chatEconomyMeta,
        abortSignal,
        onLoopExhausted: (meta) => {
          loopExhausted = meta?.stopReason === 'max_rounds';
        },
      }),
    );
  };

  if (tracePort) {
    await tracePort.startActiveSpan(METRIC.CHAT_LLM_STREAM, runLlm);
  } else {
    await runLlm();
  }

  const assistantText = String(streamResult?.assistantText ?? '');

  // Deterministic citation grounding: re-emit the turn's citations flagged
  // used/consulted so the UI stops implying support the answer never drew on.
  if (turnCitations?.length) {
    send({
      type: 'citations_final',
      citations: partitionCitationsByUse(turnCitations, assistantText),
    });
  }

  await emitFollowupSuggestions(send, {
    chatLlmPort,
    message,
    assistantText,
    opts,
    abortSignal,
    loopExhausted,
  });

  send({
    type: 'done',
    chat_economy: chatEconomyMeta,
    ...(loopExhausted ? { loop_exhausted: true } : {}),
  });
}

async function emitFollowupSuggestions(send, {
  chatLlmPort,
  message,
  assistantText,
  opts,
  abortSignal,
  loopExhausted,
}) {
  if (!chatFollowupSuggestionsEnabled()) return;
  if (loopExhausted || abortSignal?.aborted) return;
  if (!assistantText.trim() || !chatLlmPort.generateChatFollowups) return;
  try {
    const items = await chatLlmPort.generateChatFollowups(
      { question: message, answer: assistantText, uiLang: opts.uiLang ?? 'en' },
      { costRecorder: opts.costRecorder ?? null },
    );
    if (Array.isArray(items) && items.length) {
      send({ type: 'suggestions', items });
    }
  } catch {
    // Suggestions are decoration — never fail the turn over them.
  }
}

function isBillingError(err) {
  if (!err || typeof err !== 'object') return false;
  const status = err.status ?? err.statusCode ?? err?.response?.status;
  if (status === 402) return true;
  const msg = String(err.message ?? '');
  return /credit|balance|billing|payment|insufficient funds/i.test(msg);
}

function userChatErrorMessage(err) {
  if (isBillingError(err)) {
    return 'AI service unavailable — Anthropic API credits exhausted. Top up your account and try again.';
  }
  return err?.message ?? 'Chat failed';
}

async function handleStreamChatLlmError(err, send, {
  message,
  reportData,
  pboLookup,
  sliceResult,
  opts,
  chatEconomyMeta,
}) {
  // Aborts (Stop button, disconnect, timeout) are not chat failures — let the
  // route persist the partial answer and label the turn stopped.
  if (err?.name === 'AbortError') throw err;
  if (err?.code === 'llm_circuit_open' && err?.name !== 'AbortError') {
    await sendDeterministicFallback(send, {
      message,
      reportData,
      pboLookup,
      sliceResult,
      toolContextDeps: buildChatToolContextDeps(opts),
      doneMeta: { llm_circuit_open: true, chat_economy: chatEconomyMeta },
      errorDoneMeta: { mode: 'deterministic_fallback' },
    });
    return;
  }
  const errorMessage = userChatErrorMessage(err);
  send({ type: 'error', message: errorMessage });
  send({ type: 'done', error: true, message: errorMessage });
}

function buildChatLlmStreamOptions(opts, { chatEconomyMeta, abortSignal, onLoopExhausted }) {
  return {
    redactReportPayload: opts.redactReportPayload ?? null,
    sourceArchive: opts.sourceArchive ?? null,
    evidenceStore: opts.evidenceStore ?? null,
    retrievalService: opts.retrievalService ?? null,
    retrievalCache: opts.retrievalCache ?? null,
    costRecorder: opts.costRecorder ?? null,
    userEmail: opts.userEmail ?? '',
    ownerUid: opts.ownerUid ?? '',
    sessionId: opts.sessionId ?? '',
    pendingActionStore: opts.pendingActionStore ?? null,
    pboHistoricalSearchService: opts.pboHistoricalSearchService ?? null,
    pboReportReviewService: opts.pboReportReviewService ?? null,
    getMunicipalityDashboard: opts.getMunicipalityDashboard ?? null,
    geoUnknownReviewService: opts.geoUnknownReviewService ?? null,
    toolProfile: opts.toolProfile ?? 'default',
    llmPort: opts.llmPort ?? null,
    agentKernel: opts.agentKernel ?? null,
    abortSignal,
    economy: chatEconomyMeta,
    uiLang: opts.uiLang ?? 'en',
    onLoopExhausted,
  };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.userEmail]
 * @param {string} [opts.ownerUid]
 * @param {string} [opts.sessionId]
 * @param {object} [opts.pendingActionStore]
 * @param {object} [opts.pboHistoricalSearchService]
 * @param {object} [opts.pboReportReviewService]
 * @param {object} [opts.geoUnknownReviewService]
 * @param {AbortSignal} [opts.abortSignal]
 * @param {object} [opts.tracePort]
 */
export async function streamChat(message, history, rawReply, getReportData, opts = {}) {
  const redactReportPayload = opts.redactReportPayload ?? null;
  const chatLlmPort = opts.chatLlmPort;
  if (!chatLlmPort?.streamChatResponse) {
    throw new Error('streamChat requires chatLlmPort with streamChatResponse');
  }
  const reportData = chatReportData(getReportData(), redactReportPayload);
  const includeScores = reportData?.display_view === DISPLAY_VIEWS.developer;
  const reportScopeId = opts.reportGeoScope
    ?? reportData?.assessment?.report_scope?.id
    ?? 'national';

  const economy = resolveChatEconomyMode(message, {
    economy: opts.economy,
    toolProfile: opts.toolProfile,
  });
  const sliceResult = economy.contextSlicingEnabled
    ? resolveChatContextTier(message, {
      toolProfile: opts.toolProfile,
      forceFull: economy.forceFull,
    })
    : { contextSlice: 'full', reason: 'context_slicing_disabled' };

  const { context: baseContext, pboLookup } = buildReportContext(reportData, {
    includeScores,
    reportScopeId,
    contextSlice: sliceResult.contextSlice,
    componentId: sliceResult.componentId,
  });

  const chatEconomyMeta = {
    context_slice: sliceResult.contextSlice,
    compact_tool_loop: economy.compactToolLoop,
    context_slicing_enabled: economy.contextSlicingEnabled,
    economy_override: economy.economyOverride,
    context_slice_reason: sliceResult.reason,
    model: resolveChatModel(sliceResult.contextSlice),
  };

  const tracePort = opts.tracePort ?? null;
  const abortSignal = opts.abortSignal ?? null;

  throwIfAborted(abortSignal);

  const turnCitations = [];
  const send = (data) => {
    collectCitationEvent(turnCitations, data);
    try { opts.onSend?.(data); } catch { /* ignore */ }
    if (rawReply.writableEnded || rawReply.destroyed) return;
    try {
      rawReply.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch { /* client gone — nothing to deliver to */ }
  };

  send({ type: 'status', phase: 'preparing' });

  if (opts.budgetDegraded) {
    await sendDeterministicFallback(send, {
      message,
      reportData,
      pboLookup,
      sliceResult,
      toolContextDeps: buildChatToolContextDeps(opts),
      doneMeta: { budget_degraded: true, chat_economy: chatEconomyMeta },
      errorDoneMeta: { mode: 'deterministic_fallback' },
    });
    return;
  }

  const buildHint = () => buildRetrievalHint(message, history, reportData, {
    ...opts,
    onUsage: opts.costRecorder
      ? (p) => opts.costRecorder.onUsage(p)
      : undefined,
  });

  const retrievalHint = tracePort
    ? await tracePort.startActiveSpan(METRIC.CHAT_RETRIEVAL_HINT, buildHint)
    : await buildHint();

  throwIfAborted(abortSignal);

  const historySummary = String(opts.historySummary ?? '').trim();
  const context =
    String(baseContext ?? '') +
    (historySummary
      ? `\n\nCONVERSATION SUMMARY (earlier turns of this chat, condensed):\n${historySummary}`
      : '') +
    (opts.systemHint ? `\n\n${opts.systemHint}` : '') +
    (retrievalHint ? `\n\n${retrievalHint}` : '');

  console.error(
    `chat economy context_slice=${chatEconomyMeta.context_slice} compact=${chatEconomyMeta.compact_tool_loop ? 1 : 0} ` +
    `context_chars=${context.length} override=${chatEconomyMeta.economy_override}`,
  );

  if (opts.costRecorder) {
    recordChatEconomyUsage(opts.costRecorder, chatEconomyMeta, context.length);
  }

  const trimmedHistory = history.length > MAX_HISTORY_MESSAGES
    ? history.slice(-MAX_HISTORY_MESSAGES)
    : history;

  const messages = [
    ...trimmedHistory.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  send({ type: 'status', phase: 'thinking' });

  try {
    await runStreamChatLlm({
      chatLlmPort,
      context,
      pboLookup,
      messages,
      send,
      reportData,
      opts,
      chatEconomyMeta,
      abortSignal,
      tracePort,
      message,
      turnCitations,
    });
  } catch (err) {
    await handleStreamChatLlmError(err, send, {
      message,
      reportData,
      pboLookup,
      sliceResult,
      opts,
      chatEconomyMeta,
    });
  }
}

async function buildRetrievalHint(message, history, reportData, opts) {
  const retrieval = opts.retrievalService?.retrieval;
  if (!retrieval?.buildChatRetrievalHint || !ragPipelineEnabled()) return '';

  try {
    return await retrieval.buildChatRetrievalHint({
      message,
      history,
      systemHint: opts.systemHint ?? '',
      reportData,
      reportGeoScope: opts.reportGeoScope ?? 'national',
      indexWriterHelpers: reportIndexHelpers,
      sessionId: opts.sessionId ?? '',
      retrievalCache: opts.retrievalCache ?? null,
      onUsage: opts.onUsage ?? null,
    });
  } catch (err) {
    console.error('buildChatRetrievalHint:', err.message);
    return '';
  }
}
