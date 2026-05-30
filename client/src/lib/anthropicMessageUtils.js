/**
 * Client-side mirror of cross-cut-modules/llm/anthropicMessageUtils.js for UI display.
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
