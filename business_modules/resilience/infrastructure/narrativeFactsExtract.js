/**
 * Haiku facts-pass: extract narrative_claims from signals before Sonnet polish.
 */

import Anthropic from '@anthropic-ai/sdk';
import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import { extractJson } from './claudeJsonHelpers.js';
import { streamWithProgress } from './claudeExtraction.js';
import {
  buildSignalRefRegistry,
  formatSignalWithRef,
  resolveRef,
} from '../domain/services/narrativeGrounding/index.js';

const client = new Anthropic();
const DEFAULT_FACTS_MODEL = process.env.RESILIENCE_NARRATIVE_FACTS_MODEL
  ?? process.env.RESILIENCE_SELF_CHECK_MODEL
  ?? 'claude-haiku-4-5-20251001';

const VALID_RELATIONS = new Set(['parallel', 'same_article_only', 'none']);

function buildFactsSystemPrompt() {
  return (
    'You extract atomic behavioral claims from resilience signals.\n' +
    'Return ONLY valid JSON:\n' +
    '{\n' +
    '  "components": [\n' +
    '    {\n' +
    '      "component_id": "<id>",\n' +
    '      "claims": [\n' +
    '        { "text": "<short factual claim>", "signal_refs": ["type@url:…"], "relation": "parallel|same_article_only|none" }\n' +
    '      ]\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'Rules:\n' +
    '- Each claim cites ≥1 signal_ref exactly as given in the input.\n' +
    '- Do NOT invent relationships between signals from different URLs.\n' +
    '- Use relation=same_article_only only when all cited refs share the same article_url.\n' +
    '- Use relation=parallel for independent observations.\n' +
    '- One claim per distinct behavioral observation; do not merge unrelated signals.\n' +
    '- No narrative prose — claims only.\n'
  );
}

function formatFactsUserMessage(registry) {
  const blocks = RESILIENCE_COMPONENTS.map((def) => {
    const entries = registry.byComponent[def.id] ?? [];
    if (entries.length === 0) {
      return `**${def.id}**\n(no signals)`;
    }
    const signalLines = entries.map((e) => formatSignalWithRef(e.signal, e)).join('\n\n');
    return `**${def.id}**\n${signalLines}`;
  });
  return `Extract narrative_claims for each component.\n\n${blocks.join('\n\n---\n\n')}`;
}

function validateFactsOutput(parsed, registry) {
  const byComponent = {};
  for (const block of parsed?.components ?? []) {
    const claims = [];
    for (const claim of block?.claims ?? []) {
      const refs = claim?.signal_refs ?? [];
      if (!claim?.text || refs.length === 0) continue;
      const validRefs = refs.filter((r) => resolveRef(r, registry));
      if (validRefs.length === 0) continue;
      const relation = VALID_RELATIONS.has(claim.relation) ? claim.relation : 'parallel';
      claims.push({ text: claim.text, signal_refs: validRefs, relation });
    }
    byComponent[block.component_id] = claims;
  }
  return byComponent;
}

/**
 * @param {Record<string, object>} scoredComponents
 * @param {{ onUsage?: Function }} [opts]
 * @returns {Promise<Record<string, object[]>>}
 */
export async function extractNarrativeFacts(scoredComponents, { onUsage } = {}) {
  const registry = buildSignalRefRegistry(scoredComponents);
  if (registry.refCount === 0) return {};

  const stream = client.messages.stream({
    model: DEFAULT_FACTS_MODEL,
    max_tokens: 8000,
    temperature: 0,
    system: buildFactsSystemPrompt(),
    messages: [{ role: 'user', content: formatFactsUserMessage(registry) }],
  });
  await streamWithProgress(stream, '[Step 2 — Facts]');
  const message = await stream.finalMessage();
  if (onUsage) {
    onUsage({ label: '[Step 2 — Facts]', model: DEFAULT_FACTS_MODEL, usage: message.usage });
  }
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Facts pass: no text block');
  const parsed = extractJson(textBlock.text);
  return validateFactsOutput(parsed, registry);
}

export { buildSignalRefRegistry as buildFactsRegistry };
