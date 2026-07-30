/**
 * Compress chat tool outputs for LLM context (full payloads remain in stores).
 */
import { compressStructuredPayload } from '../../../cross-cut-modules/retrieval/toolResponseCompress.js';
import { PROPOSE_TOOL_NAMES } from './chatConfig.js';

function snippet(text, max = 200) {
  return String(text ?? '').slice(0, max);
}

function parseKeyValueSource(text) {
  const lines = String(text ?? '').split('\n');
  const out = { source_id: null, title: null, source_type: null, url: null, body_excerpt: '' };
  const bodyLines = [];
  let inBody = false;
  for (const line of lines) {
    if (inBody) {
      bodyLines.push(line);
      continue;
    }
    if (line.startsWith('source_id=')) out.source_id = line.slice('source_id='.length).trim();
    else if (line.startsWith('title:')) out.title = line.slice('title:'.length).trim();
    else if (line.startsWith('source_type:')) out.source_type = line.slice('source_type:'.length).trim();
    else if (line.startsWith('url:')) out.url = line.slice('url:'.length).trim();
    else if (line.trim() === '') inBody = true;
  }
  out.body_excerpt = snippet(bodyLines.join('\n'), 2000);
  return out;
}

const SOURCE_ID_RE = /source_id=([^\n]+)/;
const TITLE_RE = /^title:\s*(.+)$/m;
const SNIPPET_RE = /^snippet:\s*(.+)$/m;
const SIGNAL_HEADER_RE = /^\[\d+\]\s+id=[^\s]+\s+—\s+(\S+)\s+\(([^)]+)\)/;
const SIGNAL_EVIDENCE_RE = /\n\s+(.+)/s;

function parseSearchHits(text, maxHits = 6, snippetChars = 200) {
  const blocks = String(text ?? '').split(/\n\n+/).filter(Boolean);
  const hits = [];
  for (const block of blocks) {
    const sourceMatch = SOURCE_ID_RE.exec(block);
    const titleMatch = TITLE_RE.exec(block);
    const snippetMatch = SNIPPET_RE.exec(block);
    hits.push({
      source_id: sourceMatch?.[1]?.trim() ?? null,
      title: titleMatch?.[1]?.trim() ?? null,
      snippet_200: snippet(snippetMatch?.[1] ?? block, snippetChars),
    });
    if (hits.length >= maxHits) break;
  }
  return {
    truncated: blocks.length > maxHits,
    total: blocks.length,
    hits,
  };
}

function parseSignalLines(text, maxSignals = 8, snippetChars = 200) {
  const blocks = String(text ?? '').split(/\n\n+/).filter(Boolean);
  const signals = [];
  for (const block of blocks) {
    const header = SIGNAL_HEADER_RE.exec(block);
    const evidence = SIGNAL_EVIDENCE_RE.exec(block);
    signals.push({
      signal_type: header?.[1] ?? 'unknown',
      // Header parens are "(source_type, when)" — this is NOT a component id.
      source_type: header?.[2]?.split(',')[0]?.trim() ?? null,
      evidence_200: snippet(evidence?.[1] ?? block, snippetChars),
    });
    if (signals.length >= maxSignals) break;
  }
  return {
    truncated: blocks.length > maxSignals,
    total: blocks.length,
    signals,
  };
}

/** Compression caps — relaxed when a stronger (non-default) chat model is configured. */
const DEFAULT_CAPS = { searchHits: 6, signals: 8, snippetChars: 200 };
const STRONG_MODEL_CAPS = { searchHits: 10, signals: 15, snippetChars: 400 };

function truncateLongText(text, maxChars = 4000) {
  const s = String(text ?? '');
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars - 40)}…\n{"truncated":true}`;
}

function compressCompareDates(text) {
  const s = String(text ?? '');
  if (s.length <= 6000) return s;
  const header = s.slice(0, 2000);
  const tail = s.slice(-4000);
  return `${header}\n…[truncated middle]…\n${tail}`;
}

function compressToolOutput(toolName, raw, caps = DEFAULT_CAPS) {
  switch (toolName) {
    case 'get_source':
      // formatFullSource output always starts with a source_id= line;
      // everything else (error/guidance strings) must pass through intact.
      if (raw.startsWith('source_id=')) {
        return JSON.stringify(parseKeyValueSource(raw));
      }
      return raw;
    case 'search_sources':
    case 'list_sources':
      if (!raw.startsWith('No matching') && !raw.includes('not available')) {
        return JSON.stringify(parseSearchHits(raw, caps.searchHits, caps.snippetChars));
      }
      return raw;
    case 'lookup_signals':
      return JSON.stringify(parseSignalLines(raw, caps.signals, caps.snippetChars));
    case 'compare_dates':
      return compressCompareDates(raw);
    case 'trace_component_timeline':
      return truncateLongText(raw, 6000);
    case 'get_report_context':
      // Deliberate context fetch — the default 4k cap would cut the very
      // narrative the model asked for (component detail is emitted first).
      return truncateLongText(raw, 12_000);
    case 'get_component_evidence_bundle':
    case 'get_decision_brief':
    case 'get_pbo_review':
      try {
        const parsed = JSON.parse(raw);
        return JSON.stringify(compressStructuredPayload(parsed));
      } catch {
        return truncateLongText(raw, 4000);
      }
    case 'search_pbo_history':
      return truncateLongText(raw, 2500);
    case 'get_signal':
      // Full-evidence fetch is the tool's purpose — don't clip at the default 4k.
      return truncateLongText(raw, 8000);
    case 'get_municipality_profile':
      return truncateLongText(raw, 6000);
    default:
      if (raw.length > 4000) {
        return `${raw.slice(0, 3960)}…\n{"truncated":true}`;
      }
      return raw;
  }
}

/**
 * @param {string} toolName
 * @param {string} result
 * @param {{ enabled?: boolean, economyOverride?: string, strongModel?: boolean }} [opts]
 */
export function compressChatToolResult(toolName, result, opts = {}) {
  if (opts.enabled === false) return result;
  if (opts.economyOverride === 'full') return result;
  if (PROPOSE_TOOL_NAMES.has(toolName)) return result;

  const raw = String(result ?? '');
  if (!raw) return raw;

  const before = raw.length;
  const caps = opts.strongModel === true ? STRONG_MODEL_CAPS : DEFAULT_CAPS;
  const compressed = compressToolOutput(toolName, raw, caps);
  const after = compressed.length;
  if (before > 0 && after > 0 && before / after > 2) {
    console.error(`chat tool compress ${toolName}: ${before} → ${after} chars`);
  }

  return compressed;
}
