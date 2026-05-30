/**
 * Shared Anthropic tool-use loop for chat and validation agents.
 */
import { extractLastAssistantText } from './anthropicMessageUtils.js';
import { appendAuditEvent } from '../security/input/auditLog.js';

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

    const textBlocks = response.content.filter((b) => b.type === 'text');
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

    for (const tb of textBlocks) {
      if (tb.text && onTextBlock) onTextBlock(tb.text);
    }

    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      const assistantText = textBlocks.map((b) => b.text).join('');
      if (assistantText) {
        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: assistantText },
        ];
      }
      break;
    }

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

    const roundMeta = {
      agent: agentKind,
      round,
      model,
      tools: toolMeta,
      usage: lastUsage,
    };

    if (onToolRound) onToolRound(roundMeta);

    try {
      appendAuditEvent({
        action: 'agent.tool_round',
        meta: roundMeta,
      }, auditLogPath);
    } catch {
      // audit failure must not break agent loop
    }

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
