/**
 * Shared Anthropic tool-use loop for chat and validation agents.
 */
import { extractLastAssistantText } from './anthropicMessageUtils.js';
import { appendAuditEvent } from '../security/input/auditLog.js';

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
  } = opts;

  let currentMessages = opts.messages ?? [];
  let stopReason = null;
  let lastUsage = null;

  for (let round = 0; round <= maxRounds; round++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: currentMessages,
      tools,
    });

    stopReason = response.stop_reason ?? null;
    lastUsage = response.usage ?? null;

    if (onUsage && lastUsage) {
      onUsage({
        label: `${agentKind}:round-${round}`,
        model,
        usage: lastUsage,
      });
    }

    const textBlocks = response.content.filter((b) => b.type === 'text');
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

    emitTextBlocks(textBlocks, onTextBlock);

    if (shouldEndToolLoop(toolUseBlocks, stopReason)) {
      currentMessages = appendAssistantText(currentMessages, textBlocks);
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
  }

  return {
    messages: currentMessages,
    lastAssistantText: extractLastAssistantText(currentMessages),
    stopReason,
    usage: lastUsage,
  };
}
