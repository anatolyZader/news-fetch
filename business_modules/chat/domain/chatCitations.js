/**
 * Extract source citations from raw chat tool results (pre-compression).
 * Raw formats are the stable contract: `source_id=` lines from
 * signalLookup.formatSignals and sourceArchiveQuery.formatCandidates /
 * formatFullSource, plus a JSON `"source_id":"…"` fallback.
 */

const CITATION_TOOLS = new Set([
  'get_source',
  'search_sources',
  'list_sources',
  'lookup_signals',
  'get_signal',
  'get_municipality_profile',
]);

const MAX_CITATIONS = 8;

const SOURCE_ID_LINE_RE = /(?:^|\n)\s*(?:\[\d+\]\s*)?source_id=([^\n]+)/;
const TITLE_LINE_RE = /^title:\s*(.+)$/m;
const URL_LINE_RE = /^url:\s*(.+)$/m;
const BARE_URL_LINE_RE = /^\s*(https?:\/\/\S+)\s*$/m;
const JSON_SOURCE_ID_RE = /"source_id"\s*:\s*"([^"]+)"/g;

function pushCitation(out, seen, citation) {
  const id = String(citation.source_id ?? '').trim();
  if (!id || seen.has(id) || out.length >= MAX_CITATIONS) return;
  seen.add(id);
  const entry = { source_id: id };
  if (citation.title) entry.title = String(citation.title).trim().slice(0, 200);
  if (citation.url) entry.url = String(citation.url).trim();
  out.push(entry);
}

/**
 * @param {string} toolName
 * @param {string} rawResult tool result before compression
 * @returns {Array<{ source_id: string, title?: string, url?: string }>}
 */
export function extractCitationsFromToolResult(toolName, rawResult) {
  if (!CITATION_TOOLS.has(toolName)) return [];
  const text = String(rawResult ?? '');
  if (!text.trim()) return [];

  const out = [];
  const seen = new Set();

  for (const block of text.split(/\n\n+/)) {
    const sourceMatch = SOURCE_ID_LINE_RE.exec(block);
    if (!sourceMatch) continue;
    pushCitation(out, seen, {
      source_id: sourceMatch[1],
      title: TITLE_LINE_RE.exec(block)?.[1],
      url: URL_LINE_RE.exec(block)?.[1] ?? BARE_URL_LINE_RE.exec(block)?.[1],
    });
  }

  for (const m of text.matchAll(JSON_SOURCE_ID_RE)) {
    pushCitation(out, seen, { source_id: m[1] });
  }

  return out;
}

/**
 * Fold a streamed `citation` event into a deduped per-turn list, remembering
 * which tool produced each source (used by grounding below).
 * @param {Array<object>} list mutated in place
 * @param {{ type?: string, tool?: string, citations?: Array<object> }} event
 */
export function collectCitationEvent(list, event) {
  if (event?.type !== 'citation') return;
  for (const c of event.citations ?? []) {
    const id = String(c?.source_id ?? '').trim();
    if (!id) continue;
    const existing = list.find((x) => x.source_id === id);
    if (existing) {
      // get_source is the strongest "the model actually read this" signal — keep it.
      if (event.tool === 'get_source') existing.tool = 'get_source';
      continue;
    }
    list.push({ ...c, source_id: id, ...(event.tool ? { tool: event.tool } : {}) });
  }
}

/**
 * Deterministic citation grounding: a citation is `used` when the answer prose
 * mentions its source_id, or the model explicitly fetched it via get_source.
 * Everything else the tools merely surfaced is kept but labeled `used: false`
 * ("consulted") so the UI stops implying support the answer never drew on.
 *
 * @param {Array<{ source_id: string, title?: string, url?: string, tool?: string }>} citations
 * @param {string} assistantText
 * @returns {Array<{ source_id: string, title?: string, url?: string, used: boolean }>}
 */
function textMentionsSourceId(text, id) {
  if (!id) return false;
  let idx = 0;
  while ((idx = text.indexOf(id, idx)) !== -1) {
    // Boundary check so "db:1" does not match inside "db:11" or "db:1a".
    const next = text[idx + id.length];
    if (next === undefined || !/[\w#]/.test(next)) return true;
    idx += 1;
  }
  return false;
}

export function partitionCitationsByUse(citations, assistantText) {
  const text = String(assistantText ?? '');
  const flagged = (citations ?? []).map(({ tool, ...c }) => ({
    ...c,
    used: tool === 'get_source' || textMentionsSourceId(text, c.source_id),
  }));
  flagged.sort((a, b) => Number(b.used) - Number(a.used));
  return flagged.slice(0, MAX_CITATIONS);
}
