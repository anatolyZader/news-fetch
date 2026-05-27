/**
 * Two-step LLM evaluation using Claude API:
 *   Step 1 — Signal extraction (Haiku) → claudeExtraction.js
 *   Step 2 — Narrative generation (Sonnet) → claudeNarratives.js
 */

export { extractJsonArray } from './claudeJsonHelpers.js';
export { buildSignalExtractionSystemPrompt, extractSignals } from './claudeExtraction.js';
export { extractSignals as extractEvidence } from './claudeExtraction.js';
export {
  formatScoredComponentsForNarrative,
  generateNarratives,
  synthesizeComponents,
} from './claudeNarratives.js';
