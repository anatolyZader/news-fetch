/**
 * Chat application service — orchestrates report context and Claude streaming.
 */
import { buildReportContext } from '../domain/reportContext.js';
import { streamChatResponse } from '../infrastructure/claudeChat.js';
import { ragPipelineEnabled } from '../../../cross-cut-modules/retrieval/index.js';
import { reportIndexHelpers } from '../../../cross-cut-modules/retrieval/reportIndexHelpers.js';
import { METRIC } from '../../../cross-cut-modules/monitoring/domain/metricNames.js';
import {
  DISPLAY_VIEWS,
  redactReportPayload,
} from '../../resilience/index.js';

const MAX_HISTORY_MESSAGES = 20;

function chatReportData(raw) {
  if (!raw) return raw;
  if (raw.display_view === DISPLAY_VIEWS.analyst) return raw;
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
  const reportData = chatReportData(getReportData());
  const includeScores = reportData?.display_view === DISPLAY_VIEWS.analyst;
  const reportScopeId = opts.reportGeoScope
    ?? reportData?.assessment?.report_scope?.id
    ?? 'national';
  const { context: baseContext, pboLookup } = buildReportContext(reportData, {
    includeScores,
    reportScopeId,
  });

  const tracePort = opts.tracePort ?? null;
  const abortSignal = opts.abortSignal ?? null;

  throwIfAborted(abortSignal);

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

  const trimmedHistory = history.length > MAX_HISTORY_MESSAGES
    ? history.slice(-MAX_HISTORY_MESSAGES)
    : history;

  const messages = [
    ...trimmedHistory.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  const send = (data) => {
    try { opts.onSend?.(data); } catch { /* ignore */ }
    rawReply.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const runLlm = () => streamChatResponse(context, pboLookup, messages, send, reportData, {
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
      abortSignal,
    });

    if (tracePort) {
      await tracePort.startActiveSpan(METRIC.CHAT_LLM_STREAM, runLlm);
    } else {
      await runLlm();
    }
    send({ type: 'done' });
  } catch (err) {
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
