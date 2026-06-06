/**
 * Claude chat LLM adapter — implements IChatLlmPort.
 */
import { streamChatResponse, generateChatTitle } from '../../app/chatLlmOrchestrator.js';

/** @returns {import('../../domain/ports/IChatLlmPort.js').IChatLlmPort} */
export function createClaudeChatAdapter() {
  return { streamChatResponse, generateChatTitle };
}
