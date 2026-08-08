/**
 * Lenient JSON extraction from LLM prose (fenced blocks, repair, array salvage).
 *
 * Pipeline position: extract and assess paths — parses model output before
 * signal schema validation. Client-safe isomorphic (no Node-only deps).
 *
 * Owns: extractJson and extractJsonArray recovery strategies.
 * Does NOT: signal validation, catalog checks, or prompt assembly.
 *
 * Key collaborators: closedCatalogueExtractService.js, openVocabularyExtractService.js,
 * extractionPrompt.js, signal instance parsers.
 */
import { jsonrepair } from 'jsonrepair';

const FENCED_JSON_RE = /^```(?:json)?\s*\n([\s\S]+?)\n```\s*$/m;

/** `[label](url)` — a markdown citation, not the start of a JSON array. */
const MARKDOWN_LINK_AT_RE = /^\[[^\]]*\]\(/;

/**
 * First `[` that plausibly opens a JSON array, skipping markdown citations.
 *
 * @param {string} text
 * @returns {number} index, or -1
 */
function arrayStartIndex(text) {
  for (let i = text.indexOf('['); i !== -1; i = text.indexOf('[', i + 1)) {
    if (!MARKDOWN_LINK_AT_RE.test(text.slice(i))) return i;
  }
  return -1;
}

/**
 * Payload slices worth trying, best first.
 *
 * Object and array starts are tried as *separate* candidates rather than
 * slicing from whichever bracket comes first. Narrative prose is full of
 * markdown citations (`[label](url)`), so a leading sentence of explanation
 * would put `[` before the real `{` and yield `[label](https://… }` — which
 * fails to parse at the URL's colon, a couple of characters in, with an error
 * that says nothing about the real cause. A wrong candidate simply fails to
 * parse and the next one is tried.
 *
 * @param {string} text
 * @returns {string[]} unique candidate payloads
 */
function candidatePayloads(text) {
  const bracketed = [];
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const start = open === '[' ? arrayStartIndex(text) : text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start !== -1 && end > start) bracketed.push(text.slice(start, end + 1));
  }
  // Longest first, so the outermost container wins: for `[{"a":1}]` the object
  // slice `{"a":1}` also parses, and taking it would silently strip the array.
  bracketed.sort((a, b) => b.length - a.length);

  const candidates = [];
  // An explicit fence is the model stating where the payload is; trust it first.
  const fenced = FENCED_JSON_RE.exec(text);
  if (fenced) candidates.push(fenced[1].trim());
  candidates.push(...bracketed);

  const trimmed = text.trim();
  if (trimmed) candidates.push(trimmed);
  return [...new Set(candidates)];
}

/**
 * Reject scalars. `jsonrepair` happily turns arbitrary prose into a quoted JSON
 * string, so without this a model that answered in words instead of JSON would
 * "parse" successfully and fail somewhere further downstream with no trace of
 * the real cause.
 *
 * @param {unknown} value
 * @returns {object|unknown[]}
 */
function asJsonContainer(value) {
  if (value !== null && typeof value === 'object') return value;
  throw new TypeError(`expected a JSON object or array, got ${typeof value}`);
}

/** Enough of the raw text to identify what the model actually returned. */
function rawPreview(text) {
  const oneLine = String(text ?? '').replaceAll(/\s+/g, ' ').trim();
  return oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;
}

/**
 * Parse the first JSON object or array from LLM text (markdown fence or slice).
 *
 * Every candidate is tried strictly before any is repaired, so a genuinely
 * valid payload is never displaced by a repaired wrong one.
 *
 * @param {string} text
 * @returns {unknown}
 * @throws {Error} carrying a preview of the raw text — without it a parse
 *   failure is undiagnosable after the fact and costs a whole pipeline re-run.
 */
export function extractJson(text) {
  const candidates = candidatePayloads(String(text ?? ''));

  for (const candidate of candidates) {
    try {
      return asJsonContainer(JSON.parse(candidate));
    } catch { /* try the next candidate */ }
  }

  if (candidates.length > 0) console.error('  ⚠ JSON.parse failed — attempting jsonrepair');
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return asJsonContainer(JSON.parse(jsonrepair(candidate)));
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Could not parse JSON from model output (${lastError?.message ?? 'no candidates'}). `
    + `Raw text began: ${rawPreview(text)}`,
    { cause: lastError },
  );
}

/**
 * Parse a JSON array from LLM text; salvage individual objects when full parse fails.
 * @param {string} text
 * @returns {unknown[]}
 */
export function extractJsonArray(text) {
  try {
    return extractJson(text);
  } catch {
    const objects = [];
    const re = /\{[\s\S]+?\}(?=\s*[,\]]|\s*$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      try {
        objects.push(JSON.parse(m[0]));
      } catch {
        /* skip malformed object */
      }
    }
    if (objects.length > 0) {
      console.error(`  ⚠ Recovered ${objects.length} partial signal objects`);
      return objects;
    }
    throw new Error('Could not recover any valid JSON objects from Step 1 response');
  }
}
