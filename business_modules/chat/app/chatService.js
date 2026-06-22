/**
 * Chat application service — orchestrates report context and Claude streaming.
 */
import { buildReportContext } from '../domain/reportContext.js';
import {
  resolveChatContextTier,
  resolveChatEconomyMode,
} from '../domain/chatContextTier.js';
import { runDeterministicChatFallback } from './chatDeterministicFallback.js';
import { ragPipelineEnabled } from '../../../cross-cut-modules/retrieval/index.js';
import { reportIndexHelpers } from '../../../cross-cut-modules/retrieval/reportIndexHelpers.js';
import { METRIC } from '../../../cross-cut-modules/monitoring/domain/metricNames.js';
import { DISPLAY_VIEWS } from '../../../cross-cut-modules/resilience-contracts/index.js';

const MAX_HISTORY_MESSAGES = 20;

function chatReportData(raw, redactReportPayload) {
  if (!raw) return raw;
  if (raw.display_view === DISPLAY_VIEWS.analyst) return raw;
  if (!redactReportPayload) return raw;
  return redactReportPayload(raw, DISPLAY_VIEWS.operator);
}

function throwIfAborted(abortSignal) {
  if (!abortSignal?.aborted) return;
  const reason = abortSignal.reason;
  const message = reason instanceof Error ? reason.message : String(reason ?? 'Chat request aborted');
  const err = new Error(message);
  err.name = 'AbortError';
  throw err;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.userEmail]
 * @param {string} [opts.ownerUid]
 * @param {string} [opts.sessionId]
 * @param {object} [opts.pendingActionStore]
 * @param {object} [opts.validationReviewService]
 * @param {object} [opts.pboHistoricalSearchService]
 * @param {object} [opts.pboReportReviewService]
 * @param {object} [opts.driftService]
 * @param {object} [opts.catalogProposalService]
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
  const includeScores = reportData?.display_view === DISPLAY_VIEWS.analyst;
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
  };

  const tracePort = opts.tracePort ?? null;
  const abortSignal = opts.abortSignal ?? null;

  throwIfAborted(abortSignal);

  const send = (data) => {
    try { opts.onSend?.(data); } catch { /* ignore */ }
    rawReply.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (opts.budgetDegraded) {
    try {
      const fallbackText = await runDeterministicChatFallback({
        message,
        reportData,
        pboLookup,
        contextSlice: sliceResult.contextSlice,
        contextSliceReason: sliceResult.reason,
        toolContextDeps: {
          userEmail: opts.userEmail ?? '',
          sourceArchive: opts.sourceArchive ?? null,
          evidenceStore: opts.evidenceStore ?? null,
          retrievalService: opts.retrievalService ?? null,
          retrievalCache: opts.retrievalCache ?? null,
          toolProfile: opts.toolProfile ?? 'default',
        },
      });
      send({ type: 'text', text: fallbackText });
      send({
        type: 'done',
        mode: 'deterministic_fallback',
        budget_degraded: true,
        chat_economy: chatEconomyMeta,
      });
    } catch (err) {
      send({ type: 'error', message: err?.message ?? 'Deterministic fallback failed' });
      send({ type: 'done', error: true, mode: 'deterministic_fallback' });
    }
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

  const context =
    String(baseContext ?? '') +
    (opts.systemHint ? `\n\n${opts.systemHint}` : '') +
    (retrievalHint ? `\n\n${retrievalHint}` : '');

  console.error(
    `chat economy context_slice=${chatEconomyMeta.context_slice} compact=${chatEconomyMeta.compact_tool_loop ? 1 : 0} ` +
    `context_chars=${context.length} override=${chatEconomyMeta.economy_override}`,
  );

  if (opts.costRecorder) {
    opts.costRecorder.onUsage({
      label: 'http:chat',
      stage: 'chat_economy',
      stats: {
        context_slice: chatEconomyMeta.context_slice,
        compact_tool_loop: chatEconomyMeta.compact_tool_loop,
        context_chars: context.length,
        context_slicing_enabled: chatEconomyMeta.context_slicing_enabled,
        economy_override: chatEconomyMeta.economy_override,
        context_slice_reason: chatEconomyMeta.context_slice_reason,
      },
    });
  }

  const trimmedHistory = history.length > MAX_HISTORY_MESSAGES
    ? history.slice(-MAX_HISTORY_MESSAGES)
    : history;

  const messages = [
    ...trimmedHistory.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  try {
    let loopExhausted = false;
    const runLlm = () => chatLlmPort.streamChatResponse(context, pboLookup, messages, send, reportData, {
      sourceArchive: opts.sourceArchive ?? null,
      evidenceStore: opts.evidenceStore ?? null,
      retrievalService: opts.retrievalService ?? null,
      retrievalCache: opts.retrievalCache ?? null,
      costRecorder: opts.costRecorder ?? null,
      userEmail: opts.userEmail ?? '',
      ownerUid: opts.ownerUid ?? '',
      sessionId: opts.sessionId ?? '',
      pendingActionStore: opts.pendingActionStore ?? null,
      validationReviewService: opts.validationReviewService ?? null,
      pboHistoricalSearchService: opts.pboHistoricalSearchService ?? null,
      pboReportReviewService: opts.pboReportReviewService ?? null,
      driftService: opts.driftService ?? null,
      catalogProposalService: opts.catalogProposalService ?? null,
      geoUnknownReviewService: opts.geoUnknownReviewService ?? null,
      toolProfile: opts.toolProfile ?? 'default',
      llmPort: opts.llmPort ?? null,
      agentKernel: opts.agentKernel ?? null,
      abortSignal,
      economy: chatEconomyMeta,
      uiLang: opts.uiLang ?? 'en',
      onLoopExhausted: (meta) => {
        loopExhausted = meta?.stopReason === 'max_rounds';
      },
    });

    if (tracePort) {
      await tracePort.startActiveSpan(METRIC.CHAT_LLM_STREAM, runLlm);
    } else {
      await runLlm();
    }
    send({
      type: 'done',
      chat_economy: chatEconomyMeta,
      ...(loopExhausted ? { loop_exhausted: true } : {}),
    });
  } catch (err) {
    if (err?.code === 'llm_circuit_open' && err?.name !== 'AbortError') {
      try {
        const fallbackText = await runDeterministicChatFallback({
          message,
          reportData,
          pboLookup,
          contextSlice: sliceResult.contextSlice,
          contextSliceReason: sliceResult.reason,
          toolContextDeps: {
            userEmail: opts.userEmail ?? '',
            sourceArchive: opts.sourceArchive ?? null,
            evidenceStore: opts.evidenceStore ?? null,
            retrievalService: opts.retrievalService ?? null,
            retrievalCache: opts.retrievalCache ?? null,
            toolProfile: opts.toolProfile ?? 'default',
          },
        });
        send({ type: 'text', text: fallbackText });
        send({
          type: 'done',
          mode: 'deterministic_fallback',
          llm_circuit_open: true,
          chat_economy: chatEconomyMeta,
        });
        return;
      } catch (fallbackErr) {
        send({
          type: 'error',
          message: fallbackErr?.message ?? err?.message ?? 'LLM circuit open + fallback failed',
        });
        send({ type: 'done', error: true, mode: 'deterministic_fallback' });
        return;
      }
    }
    send({ type: 'error', message: err?.message ?? 'Chat failed' });
    send({ type: 'done', error: true });
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
