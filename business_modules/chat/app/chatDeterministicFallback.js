/**
 * Non-LLM chat fallback — dispatch deterministic tools by context tier.
 */
import { resolveChatContextTier } from '../domain/chatContextTier.js';
import { handleChatToolCall } from './chatToolHandlers.js';
import { createChatToolContext } from './createChatToolContext.js';

/**
 * @param {import('../domain/chatContextTier.js').ChatContextTier} tier
 * @param {string} message
 * @param {object} reportData
 * @returns {Array<{ tool: string, input: object }>}
 */
export function planDeterministicToolCalls(tier, message, reportData) {
  const assessmentDate = reportData?.assessment?.date ?? reportData?.reportDate ?? null;
  const text = String(message ?? '').trim();

  switch (tier) {
    case 'hub':
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
      return [{ tool: 'list_attention_items', input: { limit: 15 } }];
  }
}

/**
 * @param {string} toolResults
 * @param {{ tier: string, reason: string }} tierResult
 * @returns {string}
 */
export function formatDeterministicFallbackResponse(toolResults, tierResult) {
  const header =
    '**Deterministic mode** (LLM budget exhausted — no AI synthesis; raw tool results below)\n\n';
  const meta = `_Context tier: ${tierResult.tier} (${tierResult.reason})_\n\n`;
  return `${header}${meta}${toolResults}`;
}

/**
 * @param {object} params
 * @param {string} params.message
 * @param {object} params.reportData
 * @param {object} params.pboLookup
 * @param {import('../domain/chatContextTier.js').ChatContextTier} [params.tier]
 * @param {string} [params.tierReason]
 * @param {object} [params.toolContextDeps]
 * @returns {Promise<string>}
 */
export async function runDeterministicChatFallback(params) {
  const {
    message,
    reportData,
    pboLookup,
    tier: tierOverride,
    tierReason,
    toolContextDeps = {},
  } = params;

  const tierResult = tierOverride == null
    ? resolveChatContextTier(message, { toolProfile: toolContextDeps.toolProfile })
    : { tier: tierOverride, reason: tierReason ?? 'override' };

  const toolCtx = createChatToolContext({
    reportData,
    pboLookup,
    ...toolContextDeps,
  });

  const calls = planDeterministicToolCalls(tierResult.tier, message, reportData);
  const sections = [];

  for (const { tool, input } of calls) {
    try {
      const result = await handleChatToolCall(tool, input, toolCtx);
      sections.push(`### ${tool}\n\n${result}`);
    } catch (err) {
      sections.push(`### ${tool}\n\nError: ${err?.message ?? 'tool failed'}`);
    }
  }

  return formatDeterministicFallbackResponse(sections.join('\n\n'), tierResult);
}
