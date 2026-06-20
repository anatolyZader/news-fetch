const INSUFFICIENT_SYNTHESIS_NARRATIVE =
  'Insufficient LLM synthesis — see supporting evidence below.';

/**
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function isStubNarrative(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (t === INSUFFICIENT_SYNTHESIS_NARRATIVE) return true;
  return t.toLowerCase().includes('see supporting evidence below');
}
