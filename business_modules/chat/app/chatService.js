/**
 * Chat application service — orchestrates report context and Claude streaming.
 */
import { buildReportContext } from '../domain/reportContext.js';
import { streamChatResponse } from '../infrastructure/claudeChat.js';

const MAX_HISTORY_MESSAGES = 20;

/**
 * Stream a chat response about the current resilience report.
 * @param {string} message - user message
 * @param {Array} history - prior conversation turns
 * @param {object} rawReply - Node writable stream (reply.raw)
 * @param {function} getReportData - returns cached report data
 * @param {object} [opts]
 * @param {object} [opts.evidenceStore] - SQLite evidence store (createEvidenceStore return)
 * @param {(event: any) => void} [opts.onSend] - called for each streamed SSE event object
 * @param {string} [opts.systemHint] - appended to the system context (Anthropic requires system to be top-level)
 */
export async function streamChat(message, history, rawReply, getReportData, opts = {}) {
  const reportData = getReportData();
  const { context: baseContext, pboLookup } = buildReportContext(reportData);
  const context = String(baseContext ?? '') + (opts.systemHint ? `\n\n${opts.systemHint}` : '');

  // Cap history to prevent context overflow
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
    await streamChatResponse(context, pboLookup, messages, send, reportData, {
      evidenceStore: opts.evidenceStore ?? null,
    });
    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }
}
