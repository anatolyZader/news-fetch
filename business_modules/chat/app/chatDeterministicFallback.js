/**
 * Non-LLM chat fallback — dispatch deterministic tools by context_slice.
 */
import { resolveChatContextTier } from '../domain/chatContextTier.js';
import { handleChatToolCall } from './chatToolHandlers.js';
import { createChatToolContext } from './createChatToolContext.js';
import { narrativeFocusUiEnabled } from '../../resilience/domain/services/narrativeFocusUi.js';

/**
 * @param {import('../domain/chatContextTier.js').ContextSlice} contextSlice
 * @param {string} message
 * @param {object} reportData
 * @returns {Array<{ tool: string, input: object }>}
 */
export function planDeterministicToolCalls(contextSlice, message, reportData) {
  const assessmentDate = reportData?.assessment?.date ?? reportData?.reportDate ?? null;
  const text = String(message ?? '').trim();
  const narrativeFocus = narrativeFocusUiEnabled();

  switch (contextSlice) {
    case 'hub':
      if (narrativeFocus) {
        return [{ tool: 'lookup_signals', input: { limit: 15 } }];
      }
      return [
        { tool: 'list_attention_items', input: { limit: 10 } },
        { tool: 'get_decision_brief', input: {} },
      ];
    case 'compare': {
      const dates = reportData?.report_dates ?? reportData?.available_dates ?? [];
      const dateB = assessmentDate ?? dates[dates.length - 1] ?? null;
      const dateA = dates.length >= 2 ? dates[dates.length - 2] : dateB;
      return [{ tool: 'compare_dates', input: { date_a: dateA, date_b: dateB } }];
    }
    case 'minimal':
      if (/\bsearch\b/i.test(text) || /חיפוש/.test(text)) {
        return [{ tool: 'search_sources', input: { query: text.slice(0, 200), limit: 8 } }];
      }
      return [{ tool: 'lookup_signals', input: { query: text.slice(0, 200), limit: 10 } }];
    case 'component':
      return [{
        tool: 'lookup_signals',
        input: {
          query: text.slice(0, 200) || undefined,
          limit: 10,
        },
      }];
    case 'full':
    case 'standard':
    default:
      if (narrativeFocus) {
        return [{ tool: 'lookup_signals', input: { query: text.slice(0, 200) || undefined, limit: 15 } }];
      }
      return [{ tool: 'list_attention_items', input: { limit: 15 } }];
  }
}

/**
 * @param {string} toolResults
 * @param {{ contextSlice: string, reason: string }} sliceResult
 * @returns {string}
 */
export function formatDeterministicFallbackResponse(toolResults, sliceResult) {
  const header =
    '**Deterministic mode** (LLM budget exhausted — no AI synthesis; raw tool results below)\n\n';
  const meta = `_Context slice: ${sliceResult.contextSlice} (${sliceResult.reason})_\n\n`;
  return `${header}${meta}${toolResults}`;
}

/**
 * @param {object} params
 * @param {string} params.message
 * @param {object} params.reportData
 * @param {object} params.pboLookup
 * @param {import('../domain/chatContextTier.js').ContextSlice} [params.contextSlice]
 * @param {string} [params.contextSliceReason]
 * @param {object} [params.toolContextDeps]
 * @returns {Promise<string>}
 */
export async function runDeterministicChatFallback(params) {
  const {
    message,
    reportData,
    pboLookup,
    contextSlice: contextSliceOverride,
    contextSliceReason,
    toolContextDeps = {},
  } = params;

  const sliceResult = contextSliceOverride == null
    ? resolveChatContextTier(message, { toolProfile: toolContextDeps.toolProfile })
    : { contextSlice: contextSliceOverride, reason: contextSliceReason ?? 'override' };

  const toolCtx = createChatToolContext({
    reportData,
    pboLookup,
    ...toolContextDeps,
  });

  const calls = planDeterministicToolCalls(sliceResult.contextSlice, message, reportData);
  const sections = [];

  for (const { tool, input } of calls) {
    try {
      const result = await handleChatToolCall(tool, input, toolCtx);
      sections.push(`### ${tool}\n\n${result}`);
    } catch (err) {
      sections.push(`### ${tool}\n\nError: ${err?.message ?? 'tool failed'}`);
    }
  }

  return formatDeterministicFallbackResponse(sections.join('\n\n'), sliceResult);
}
