/**
 * Shared Anthropic tool-use loop for chat and validation agents.
 */
import { extractLastAssistantText } from './anthropicMessageUtils.js';
import { appendAuditEvent } from '../security/input/auditLog.js';
import { buildCompactMemoryBlock, formatCompactMemoryMessage } from '../agent/memory/compactMemoryBlock.js';
import {
  prepareAnthropicRequest,
  resolvePromptCacheFeature,
  stripAnthropicInternalParams,
} from './promptCache.js';

function emitTextBlocks(textBlocks, onTextBlock) {
  if (!onTextBlock) return;
  for (const tb of textBlocks) {
    if (tb.text) onTextBlock(tb.text);
  }
}

function appendAssistantText(currentMessages, textBlocks) {
  const assistantText = textBlocks.map((b) => b.text).join('');
  if (!assistantText) return currentMessages;
  return [...currentMessages, { role: 'assistant', content: assistantText }];
}

function shouldEndToolLoop(toolUseBlocks, stopReason) {
  return toolUseBlocks.length === 0 || stopReason === 'end_turn';
}

async function executeToolRound(toolUseBlocks, executeTool) {
  const toolMeta = [];
  const toolResults = [];
  for (const tu of toolUseBlocks) {
    const started = Date.now();
    const result = await executeTool(tu.name, tu.input ?? {}, tu);
    const latencyMs = Date.now() - started;
    toolMeta.push({
      name: tu.name,
      latencyMs,
      resultBytes: typeof result === 'string' ? result.length : JSON.stringify(result).length,
    });
    toolResults.push({
      type: 'tool_result',
      tool_use_id: tu.id,
      content: typeof result === 'string' ? result : JSON.stringify(result),
    });
  }
  return { toolMeta, toolResults };
}

function auditToolRound(roundMeta, auditLogPath) {
  try {
    appendAuditEvent({
      action: 'agent.tool_round',
      meta: roundMeta,
    }, auditLogPath);
  } catch {
    // audit failure must not break agent loop
  }
}

function applyCompactHistoryMessages({
  initialUserMessage,
  responseContent,
  toolResults,
  workingMemory,
  budget,
}) {
  const memoryBlock = formatCompactMemoryMessage(
    buildCompactMemoryBlock(workingMemory, budget),
  );
  const tailAssistant = { role: 'assistant', content: responseContent };
  const tailUser = { role: 'user', content: toolResults };
  return initialUserMessage
    ? [initialUserMessage, memoryBlock, tailAssistant, tailUser]
    : [memoryBlock, tailAssistant, tailUser];
}

/**
 * @param {{
 *   client: { messages: { create: Function } },
 *   model: string,
 *   system: string,
 *   messages: Array<object>,
 *   tools: Array<object>,
 *   maxRounds?: number,
 *   maxTokens?: number,
 *   temperature?: number,
 *   executeTool: (name: string, input: object, toolUseBlock: object) => Promise<string> | string,
 *   onTextBlock?: (text: string) => void,
 *   onToolRound?: (meta: object) => void,
 *   onUsage?: (payload: { label: string, model: string, usage: object }) => void,
 *   agentKind?: string,
 *   auditLogPath?: string,
 *   compactHistoryAfterRound?: boolean,
 *   workingMemory?: { snapshot: () => object },
 *   budget?: { snapshot: () => object },
 * }} opts
 * @returns {Promise<{ messages: Array<object>, lastAssistantText: string, stopReason: string | null, usage: object | null }>}
 */
export async function runToolLoop(opts) {
  const {
    client,
    model,
    system,
    tools,
    maxRounds = 5,
    maxTokens = 4000,
    temperature = 0,
    executeTool,
    onTextBlock,
    onToolRound,
    onUsage,
    agentKind = 'unknown',
    auditLogPath,
    compactHistoryAfterRound = false,
    workingMemory = null,
    budget = null,
  } = opts;

  let currentMessages = opts.messages ?? [];
  const initialUserMessage = currentMessages.find((m) => m.role === 'user') ?? currentMessages[0] ?? null;
  let stopReason = null;
  let lastUsage = null;
  let endedByToolLoop = false;

  function throwIfAborted() {
    const signal = opts.abortSignal;
    if (!signal?.aborted) return;
    const reason = signal.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? 'Aborted');
    const err = new Error(message);
    err.name = 'AbortError';
    throw err;
  }

  for (let round = 0; round <= maxRounds; round++) {
    throwIfAborted();
    const prepared = prepareAnthropicRequest({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: currentMessages,
      tools,
      agentKind,
      callContext: opts.callContext,
    }, { feature: resolvePromptCacheFeature({ ...opts, agentKind }) });

    const response = await client.messages.create(stripAnthropicInternalParams(prepared));

    stopReason = response.stop_reason ?? null;
    lastUsage = response.usage ?? null;

    if (onUsage && lastUsage) {
      onUsage({
        label: `${agentKind}:round-${round}`,
        model,
        usage: lastUsage,
        stopReason,
        promptCacheApplied: prepared.callContext?.promptCacheApplied === true,
      });
    }

    const textBlocks = response.content.filter((b) => b.type === 'text');
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

    emitTextBlocks(textBlocks, onTextBlock);

    if (shouldEndToolLoop(toolUseBlocks, stopReason)) {
      currentMessages = appendAssistantText(currentMessages, textBlocks);
      endedByToolLoop = true;
      break;
    }

    const { toolMeta, toolResults } = await executeToolRound(toolUseBlocks, executeTool);

    const roundMeta = {
      agent: agentKind,
      round,
      model,
      tools: toolMeta,
      usage: lastUsage,
    };

    if (onToolRound) onToolRound(roundMeta);
    auditToolRound(roundMeta, auditLogPath);

    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];

    if (compactHistoryAfterRound && round >= 0 && workingMemory) {
      currentMessages = applyCompactHistoryMessages({
        initialUserMessage,
        responseContent: response.content,
        toolResults,
        workingMemory,
        budget,
      });
    }
  }

  // If we completed the loop without hitting an explicit end condition, surface
  // a distinct stop reason for observability + client UX.
  if (!endedByToolLoop && (stopReason == null || stopReason === 'tool_use')) {
    stopReason = 'max_rounds';
  }

  return {
    messages: currentMessages,
    lastAssistantText: extractLastAssistantText(currentMessages),
    stopReason,
    usage: lastUsage,
  };
}
