/**
 * Shared user-message builder for report_build draft generation.
 */

/**
 * @param {object} structuredState
 * @param {Array<{role?: string, text?: string}>} turnHistory
 * @param {{ blockText?: string }} [ragContext]
 */
export function buildDraftUserContent(structuredState, turnHistory, ragContext = null) {
  const turns = Array.isArray(turnHistory) ? turnHistory : [];
  const turnLines = turns
    .map((t) => {
      const role = t.role === 'bot' ? '[bot]' : '[officer]';
      return `${role} ${(t.text ?? '').trim()}`;
    })
    .join('\n');

  let content =
    `Structured summary (authoritative — draft must reflect only these fields):\n` +
    `${JSON.stringify(structuredState ?? {}, null, 2)}\n\n` +
    `Raw dialogue (for tone and phrasing; do not introduce new facts):\n` +
    `${turnLines}\n\n`;

  const block = String(ragContext?.blockText ?? '').trim();
  if (block) {
    content += `${block}\n\n`;
  }

  content += 'Write the Hebrew prose draft now.';
  return content;
}
