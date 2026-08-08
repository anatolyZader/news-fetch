/**
 * Non-LLM chat fallback — dispatch deterministic tools by context_slice.
 */
import { resolveChatContextTier } from '../domain/chatContextTier.js';
import { handleChatToolCall } from './chatToolHandlers.js';
import { createChatToolContext } from './createChatToolContext.js';
import { extractMunicipalityFromMessage } from '../domain/municipalityResolve.js';
import { userEpistemicOverlayEnabled } from '../../resilience_scorer/index.js';

function planCompareToolCalls(reportData, assessmentDate) {
  const dates = reportData?.report_dates ?? reportData?.available_dates ?? [];
  const dateB = assessmentDate ?? dates.at(-1) ?? null;
  const dateA = dates.length >= 2 ? dates.at(-2) : dateB;
  return [{ tool: 'compare_dates', input: { date_a: dateA, date_b: dateB } }];
}

function planTemporalToolCalls(text, componentId) {
  const municipality = extractMunicipalityFromMessage(text) ?? undefined;
  if (!componentId) {
    return [{ tool: 'lookup_signals', input: { query: text.slice(0, 200), limit: 15 } }];
  }
  return [{
    tool: 'trace_component_timeline',
    input: {
      component: componentId,
      ...(municipality ? { municipality } : {}),
    },
  }];
}

/**
 * @param {import('../domain/chatContextTier.js').ContextSlice} contextSlice
 * @param {string} message
 * @param {object} reportData
 * @param {{ componentId?: string }} [opts]
 * @returns {Array<{ tool: string, input: object }>}
 */
export function planDeterministicToolCalls(contextSlice, message, reportData, opts = {}) {
  const assessmentDate = reportData?.assessment?.date ?? reportData?.reportDate ?? null;
  const text = String(message ?? '').trim();
  const narrativeFocus = !userEpistemicOverlayEnabled();
  const isRichSurface = reportData?.assessment?.user_surface_mode === 'rich';
  const componentId = opts.componentId;

  switch (contextSlice) {
    case 'hub':
      if (narrativeFocus) {
        return [{ tool: 'lookup_signals', input: { limit: 15 } }];
      }
      return [
        { tool: 'list_attention_items', input: { limit: 10 } },
        { tool: 'get_decision_brief', input: {} },
      ];
    case 'compare':
      return planCompareToolCalls(reportData, assessmentDate);
    case 'temporal':
      return planTemporalToolCalls(text, componentId);
    case 'minimal':
      if (/\bsearch\b/i.test(text) || /חיפוש/.test(text)) {
        return [{ tool: 'search_sources', input: { query: text.slice(0, 200), limit: 8 } }];
      }
      return [{ tool: 'lookup_signals', input: { query: text.slice(0, 200), limit: 10 } }];
    case 'component':
      if (isRichSurface && componentId) {
        return [{
          tool: 'get_component_evidence_bundle',
          input: { component: componentId, limit: 50 },
        }];
      }
      return [{
        tool: 'lookup_signals',
        input: {
          query: text.slice(0, 200) || undefined,
          component: componentId,
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
 * @param {string} [params.componentId]
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
    componentId,
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

  const calls = planDeterministicToolCalls(
    sliceResult.contextSlice,
    message,
    reportData,
    { componentId },
  );
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
