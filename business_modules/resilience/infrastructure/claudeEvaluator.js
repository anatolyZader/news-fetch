/**
 * LLM evaluation using Claude API:
 *   Signal extraction (Haiku) → claudeExtraction.js
 */

export { extractJsonArray } from './claudeJsonHelpers.js';
export { buildSignalExtractionSystemPrompt, extractSignals } from './claudeExtraction.js';
export { extractSignals as extractEvidence } from './claudeExtraction.js';
export { generateNarratives } from './claudeNarratives.js';
