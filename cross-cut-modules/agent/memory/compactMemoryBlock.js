/**
 * Compact working-memory snapshot for tool-loop context trimming.
 */

/**
 * @param {{ snapshot: () => object }} memory
 * @param {{ snapshot?: () => object }|null} [budget]
 */
export function buildCompactMemoryBlock(memory, budget = null) {
  const snap = memory?.snapshot?.() ?? {};
  const toolSummaries = [];
  for (const [key, val] of Object.entries(snap)) {
    if (!key.startsWith('tool:')) continue;
    const text = typeof val === 'string' ? val : JSON.stringify(val);
    toolSummaries.push({
      key,
      bytes: text.length,
      preview: text.slice(0, 280),
    });
  }
  return {
    type: 'working_memory',
    tools: toolSummaries.slice(-8),
    budget: budget?.snapshot?.() ?? null,
  };
}

/**
 * @param {object} block
 */
export function formatCompactMemoryMessage(block) {
  return {
    role: 'user',
    content: `[COMPACT WORKING MEMORY — prior tool rounds summarized]\n${JSON.stringify(block)}`,
  };
}
