/**
 * Chat application service — orchestrates report context and Claude streaming.
 */
import { buildReportContext } from '../domain/reportContext.js';
import { streamChatResponse } from '../infrastructure/claudeChat.js';
import { embeddingsEnabled } from '../../../cross-cut-modules/vector_index/index.js';
import {
  DISPLAY_VIEWS,
  redactReportPayload,
  deriveInstrumentState,
} from '../../resilience/domain/services/assessmentDisplayTier.js';

const MAX_HISTORY_MESSAGES = 20;
const INDEXED_NAMESPACES = new Map(); // namespace -> fingerprint string

/**
 * Stream a chat response about the current resilience report.
 * @param {string} message - user message
 * @param {Array} history - prior conversation turns
 * @param {object} rawReply - Node writable stream (reply.raw)
 * @param {function} getReportData - returns cached report data
 * @param {object} [opts]
 * @param {object} [opts.sourceArchive] - source archive (createSourceArchive return)
 * @param {object} [opts.evidenceStore] - legacy evidence store (bridge for old ids)
 * @param {object} [opts.vectorIndexStore] - createVectorIndexStore(sqlitePath) return (optional)
 * @param {(event: any) => void} [opts.onSend] - called for each streamed SSE event object
 * @param {string} [opts.systemHint] - appended to the system context (Anthropic requires system to be top-level)
 */
function chatReportData(raw) {
  if (!raw) return raw;
  if (raw.display_view === DISPLAY_VIEWS.analyst) return raw;
  return redactReportPayload(raw, DISPLAY_VIEWS.operator);
}

export async function streamChat(message, history, rawReply, getReportData, opts = {}) {
  const reportData = chatReportData(getReportData());
  const includeScores = reportData?.display_view === DISPLAY_VIEWS.analyst;
  const { context: baseContext, pboLookup } = buildReportContext(reportData, { includeScores });
  const retrievalHint = await buildRetrievalHint(message, reportData, opts.vectorIndexStore ?? null);
  const context =
    String(baseContext ?? '') +
    (opts.systemHint ? `\n\n${opts.systemHint}` : '') +
    (retrievalHint ? `\n\n${retrievalHint}` : '');

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
      sourceArchive: opts.sourceArchive ?? null,
      evidenceStore: opts.evidenceStore ?? null,
    });
    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }
}

function reportNamespace(reportData) {
  const date =
    reportData?.assessment?.date ??
    reportData?.reportDate ??
    'unknown-date';
  const scope = reportData?.assessment?.report_scope?.id ?? 'national';
  return `chat:${date}:${scope}`;
}

function signalCountFromReport(reportData) {
  if (Array.isArray(reportData?.signals)) return reportData.signals.length;
  const assessmentSignals = reportData?.assessment?.signals;
  if (Array.isArray(assessmentSignals)) return assessmentSignals.length;
  return 0;
}

function signalsFromReport(reportData, assessment) {
  if (Array.isArray(reportData?.signals)) return reportData.signals;
  if (Array.isArray(assessment?.signals)) return assessment.signals;
  return [];
}

function fingerprintReport(reportData) {
  const a = reportData?.assessment ?? {};
  const sigCount = signalCountFromReport(reportData);
  const createdAt = reportData?.created_at ?? reportData?.createdAt ?? '';
  const scope = a?.report_scope?.id ?? 'national';
  return `${a?.date ?? ''}|scope=${scope}|signals=${sigCount}|created=${createdAt}`;
}

function signalToDoc(signal, idx) {
  const ev = String(signal?.evidence ?? '').trim();
  const type = String(signal?.signal_type ?? '').trim();
  const url = signal?.article_url ?? null;
  const src = signal?.article_source ?? null;
  const st = signal?.source_type ?? null;
  const d = signal?.signal_file_date ?? signal?.date ?? null;
  const docId = signal?.signal_id ? String(signal.signal_id) : `signal:${idx + 1}`;
  const text = `${type}\n${ev}`;
  return {
    docId,
    kind: 'signal',
    text,
    meta: { type, url, article_source: src, source_type: st, date: d },
  };
}

function componentToDoc(component) {
  const id = String(component?.component_id ?? '').trim();
  if (!id) return null;
  const narrative = String(component?.narrative ?? '').trim();
  const evidence = Array.isArray(component?.evidence) ? component.evidence.join('\n') : '';
  const inst = component?.instrument ?? deriveInstrumentState(component);
  const text =
    `${id}\n` +
    `Instrument: confidence=${inst.confidence}, sufficiency=${inst.evidence_sufficiency}` +
    `${inst.contested ? ', contested' : ''}${inst.significant_delta ? ', significant_delta' : ''}\n\n` +
    `${narrative}\n\nEvidence:\n${evidence}`;
  return {
    docId: `component:${id}`,
    kind: 'component',
    text,
    meta: { component_id: id },
  };
}

async function ensureIndexed(reportData, vectorIndexStore) {
  if (!vectorIndexStore || typeof vectorIndexStore.upsertDocuments !== 'function') return;
  if (!embeddingsEnabled()) return;
  if (!reportData?.assessment) return;

  const ns = reportNamespace(reportData);
  const fp = fingerprintReport(reportData);
  const prev = INDEXED_NAMESPACES.get(ns);
  if (prev === fp) return;

  const a = reportData.assessment;
  const docs = [];

  const synth = String(a.cross_component_synthesis ?? '').trim();
  docs.push({
    docId: 'assessment:summary',
    kind: 'assessment',
    text:
      `Assessment date: ${a.date}\n` +
      `Scope: ${a?.report_scope?.label ?? a?.report_scope?.id ?? 'national'}\n\n` +
      `${synth}\n\n` +
      `Evidence quality: ${String(a.evidence_quality_note ?? '').trim()}`,
    meta: { date: a.date, scope: a?.report_scope?.id ?? 'national' },
  });

  for (const c of a.components ?? []) {
    const d = componentToDoc(c);
    if (d) docs.push(d);
  }

  const signals = signalsFromReport(reportData, a);
  for (let i = 0; i < signals.length; i++) {
    docs.push(signalToDoc(signals[i], i));
  }

  await vectorIndexStore.upsertDocuments({ namespace: ns, documents: docs });
  INDEXED_NAMESPACES.set(ns, fp);
}

async function buildRetrievalHint(userMessage, reportData, vectorIndexStore) {
  if (process.env.CHAT_RAG_ENABLED === '0') return '';
  if (!vectorIndexStore || typeof vectorIndexStore.querySimilar !== 'function') return '';
  if (!embeddingsEnabled()) return '';
  if (!reportData?.assessment) return '';

  try {
    await ensureIndexed(reportData, vectorIndexStore);
  } catch {
    return '';
  }

  const ns = reportNamespace(reportData);
  const topK = Math.max(4, Math.min(14, Number.parseInt(process.env.CHAT_RAG_TOPK ?? '10', 10) || 10));
  const minSim = Number.parseFloat(process.env.CHAT_RAG_MIN_SIM ?? '0.25');
  const hits = await vectorIndexStore.querySimilar({
    namespace: ns,
    queryText: userMessage,
    topK,
    minSim: Number.isFinite(minSim) ? minSim : 0.25,
  });
  if (!hits?.length) return '';

  const lines = hits.map((h, i) => {
    const meta = h.meta ?? {};
    const url = meta.url ? `\n    source: ${meta.url}` : '';
    const snippet = String(h.text ?? '').replaceAll(/\s+/g, ' ').trim().slice(0, 260);
    return `[${i + 1}] (${h.kind}, sim=${h.sim.toFixed(2)}) ${snippet}${url}`;
  }).join('\n');

  return (
    `RETRIEVED EVIDENCE (semantic search; cite these when relevant):\n` +
    `${lines}\n\n` +
    `If you need more detail or exact quotes, use search_sources → get_source (originals) or lookup_signals (behavioral index).`
  );
}
