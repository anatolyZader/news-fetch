/**
 * Shared prompt assembly for validation explain (one-shot and agent).
 */

export function buildValidationExplainSystemPrompt() {
  return (
    'You help analysts understand validation flags. Answer only from the provided chunks, signals, and reasons. ' +
    'Do not invent quotes or facts. If evidence is insufficient, say so briefly. ' +
    'When recommending an action, suggest label/skip/defer but do not claim it was applied.'
  );
}

function formatReasonLine(r) {
  const suffix = r.component_id ? ` (${r.component_id})` : '';
  return '- ' + r.code + suffix;
}

function formatReasons(reasons) {
  return (reasons ?? []).map(formatReasonLine).join('\n');
}

function formatSimilarArticle(a) {
  return `- ${a.title}: ${a.snippet}`;
}

function formatChunks(chunks) {
  return (chunks ?? [])
    .map((c) => `[${c.source_id} c${c.chunk_index}] ${c.text}`)
    .join('\n\n');
}

/**
 * @param {object} item queue item
 * @param {object} rag context
 * @param {string} question
 */
export function buildValidationExplainUserBlock(item, rag, question) {
  const q = String(question ?? 'Why was this article flagged for review?').trim();
  const signals = (item.signals ?? [])
    .map((s) => `type=${s.signal_type} evidence="${String(s.evidence ?? '').slice(0, 400)}"`)
    .join('\n');

  return (
    `Question: ${q}\n\n` +
    `Flag reasons:\n${formatReasons(item.reasons)}\n\n` +
    `Signals:\n${signals || '(none)'}\n\n` +
    `Article chunks (primary source — cite only from here):\n${formatChunks(rag.article_chunks) || '(no chunks)'}\n\n` +
    `Similar articles (context only, do not invent quotes):\n` +
    `${(rag.similar_articles ?? []).map(formatSimilarArticle).join('\n') || '(none)'}\n\n` +
    `Same story cluster: ${rag.same_story?.cluster_id ?? 'none'}\n`
  );
}
