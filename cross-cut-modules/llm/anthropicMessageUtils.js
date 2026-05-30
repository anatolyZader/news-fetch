/**
 * Helpers for Anthropic message content (string or block array).
 */

/**
 * @param {string | Array<{ type?: string, text?: string }> | null | undefined} content
 * @returns {string}
 */
export function extractTextFromContent(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content);
  return content
    .filter((block) => block?.type === 'text' && block.text)
    .map((block) => block.text)
    .join('');
}

/**
 * @param {Array<{ role?: string, content?: unknown }>} messages
 * @returns {string}
 */
export function extractLastAssistantText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === 'assistant') {
      return extractTextFromContent(msg.content);
    }
  }
  return '';
}

/**
 * Simplified transcript for UI display (skips tool_result user turns).
 * @param {Array<{ role?: string, content?: unknown }>} messages
 * @returns {Array<{ role: 'user' | 'assistant', text: string }>}
 */
export function simplifyMessagesForDisplay(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const msg of messages) {
    if (msg?.role === 'user') {
      const text = extractTextFromContent(msg.content);
      if (text) out.push({ role: 'user', text });
    } else if (msg?.role === 'assistant') {
      const text = extractTextFromContent(msg.content);
      if (text) out.push({ role: 'assistant', text });
    }
  }
  return out;
}
