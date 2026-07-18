/**
 * Shared streaming LLM call for the narrative pipeline: port.stream →
 * progress → finalMessage, wrapped in withLlmRetry.
 *
 * Token overflow is deterministic — rethrow immediately so the pipeline's
 * overflow-rebudget escalation handles it instead of burning retries.
 */
import { withLlmRetry } from '../../../cross-cut-modules/llm/withLlmRetry.js';
import { isTokenOverflowError } from '../domain/services/narrative/narrativePromptBudget.js';
import { streamWithProgress } from './claudeExtraction.js';

export function narrativeRetryOpts(label) {
  return {
    shouldRetry: (err) => !isTokenOverflowError(err),
    onRetry: (err, attempt, wait) =>
      console.error(`  ⚠ ${label} attempt ${attempt} failed (${err.message}) — retrying in ${wait / 1000}s...`),
  };
}

/**
 * @param {{ stream: Function }} port resolved LlmPort
 * @param {object} request stream request (model, max_tokens, system, messages, callContext)
 * @param {{ label: string, skipProgress?: boolean }} opts
 * @returns {Promise<object>} finalMessage
 */
export async function streamMessageWithRetry(port, request, { label, skipProgress = false }) {
  return withLlmRetry(async () => {
    const stream = await Promise.resolve(port.stream(request));
    if (!skipProgress) await streamWithProgress(stream, label);
    return stream.finalMessage();
  }, narrativeRetryOpts(label));
}
