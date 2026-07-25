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

async function executeToolRound(toolUseBlocks, executeTool, throwIfAborted) {
  const toolMeta = [];
  const toolResults = [];
  for (const tu of toolUseBlocks) {
    // An abort mid-round must not run the remaining tools (some, like
    // generate_brief, make their own LLM calls).
    throwIfAborted?.();
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

function notifyToolStart(onToolStart, toolUseBlocks, round, maxRounds) {
  if (!onToolStart) return;
  const displayRound = round + 1;
  for (const tu of toolUseBlocks) {
    onToolStart({ name: tu.name, round: displayRound, maxRounds });
  }
}

/**
 * Stream one model round via the SDK MessageStream; resolves to the final Message.
 * @param {{ messages: { stream: Function } }} client
 * @param {object} request prepared + stripped Anthropic request
 * @param {{ onTextDelta: (t: string) => void, abortSignal?: AbortSignal|null }} opts
 * @returns {Promise<object>} final message (content, stop_reason, usage)
 */
async function streamModelRound(client, request, opts) {
  const stream = client.messages.stream(request);
  const signal = opts.abortSignal ?? null;
  const onAbort = () => stream.abort();
  if (signal?.aborted) stream.abort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  stream.on('text', (delta) => {
    try { opts.onTextDelta(delta); } catch { /* delta callback must not break the loop */ }
  });
  try {
    return await stream.finalMessage();
  } catch (err) {
    if (signal?.aborted) {
      const reason = signal.reason;
      const e = new Error(reason instanceof Error ? reason.message : String(reason ?? 'Aborted'));
      e.name = 'AbortError';
      throw e;
    }
    throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

async function performModelRound(opts, currentMessages, round) {
  const { client, model, tools, maxTokens = 4000, temperature = 0, agentKind = 'unknown', onUsage } = opts;
  const prepared = prepareAnthropicRequest({
    model,
    max_tokens: maxTokens,
    temperature,
    system: opts.system,
    messages: currentMessages,
    tools,
    agentKind,
    callContext: opts.callContext,
  }, { feature: resolvePromptCacheFeature({ ...opts, agentKind }) });

  const request = stripAnthropicInternalParams(prepared);
  const useStream = typeof opts.onTextDelta === 'function'
    && typeof client.messages?.stream === 'function';
  const response = useStream
    ? await streamModelRound(client, request, opts)
    : await client.messages.create(request);
  const stopReason = response.stop_reason ?? null;
  const usage = response.usage ?? null;

  if (onUsage && usage) {
    onUsage({
      label: `${agentKind}:round-${round}`,
      model,
      usage,
      stopReason,
      promptCacheApplied: prepared.callContext?.promptCacheApplied === true,
    });
  }

  return { response, stopReason, usage };
}

function applyCompactHistoryMessages({
  initialMessages,
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
  return [...initialMessages, memoryBlock, tailAssistant, tailUser];
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
 *   onTextDelta?: (text: string) => void,
 *   onToolStart?: (meta: { name: string, round: number, maxRounds: number }) => void,
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
    model,
    maxRounds = 5,
    executeTool,
    onTextBlock,
    onToolStart,
    onToolRound,
    agentKind = 'unknown',
    auditLogPath,
    compactHistoryAfterRound = false,
    workingMemory = null,
    budget = null,
  } = opts;

  let currentMessages = opts.messages ?? [];
  // Compaction must preserve the whole seed conversation (history + current
  // question), not just the first user message — see chat multi-turn sessions.
  const initialMessages = [...currentMessages];
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
    const { response, stopReason: roundStopReason, usage } = await performModelRound(opts, currentMessages, round);
    stopReason = roundStopReason;
    lastUsage = usage;

    const textBlocks = response.content.filter((b) => b.type === 'text');
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

    // With onTextDelta the text was already streamed token-by-token.
    if (!opts.onTextDelta) emitTextBlocks(textBlocks, onTextBlock);

    if (shouldEndToolLoop(toolUseBlocks, stopReason)) {
      currentMessages = appendAssistantText(currentMessages, textBlocks);
      endedByToolLoop = true;
      break;
    }

    notifyToolStart(onToolStart, toolUseBlocks, round, maxRounds);

    const { toolMeta, toolResults } = await executeToolRound(toolUseBlocks, executeTool, throwIfAborted);

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
        initialMessages,
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
