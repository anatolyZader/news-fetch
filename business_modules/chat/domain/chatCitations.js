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
