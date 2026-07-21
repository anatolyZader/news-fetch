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

function jsonStartIndex(text) {
  const arrIdx = text.indexOf('[');
  const objIdx = text.indexOf('{');
  if (arrIdx === -1) return objIdx;
  if (objIdx === -1) return arrIdx;
  return Math.min(arrIdx, objIdx);
}

function sliceJsonPayload(text) {
  const start = jsonStartIndex(text);
  if (start === -1) return text.trim();
  const lastArr = text.lastIndexOf(']');
  const lastObj = text.lastIndexOf('}');
  const end = Math.max(lastArr, lastObj);
  if (end > start) return text.slice(start, end + 1);
  return text.trim();
}

const FENCED_JSON_RE = /^```(?:json)?\s*\n([\s\S]+?)\n```\s*$/m;

/**
 * Parse the first JSON object or array from LLM text (markdown fence or slice).
 * Falls back to jsonrepair on parse failure.
 * @param {string} text
 * @returns {unknown}
 */
export function extractJson(text) {
  const fenced = FENCED_JSON_RE.exec(text);
  const raw = fenced ? fenced[1].trim() : sliceJsonPayload(text);

  try {
    return JSON.parse(raw);
  } catch {
    console.error('  ⚠ JSON.parse failed — attempting jsonrepair');
    return JSON.parse(jsonrepair(raw));
  }
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
