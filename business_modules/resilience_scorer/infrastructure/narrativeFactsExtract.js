/**
 * Haiku facts-pass: extract narrative_claims from signals before Sonnet polish.
 */

import { resolveLlmPort, transportMeta } from '../../../cross-cut-modules/llm/resolveLlmPort.js';
import { HAIKU_MODEL } from '../../../cross-cut-modules/llm/modelIds.js';
import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import { COMPONENT_IDS } from '../domain/contracts/componentIds.js';
import { extractJson } from './claudeJsonHelpers.js';
import { streamMessageWithRetry } from './llmStreamCall.js';
import { narrativeFactsMaxTokens } from '../domain/services/narrativeGrounding/groundingConfig.js';
import { chunkComponentIds } from '../domain/services/narrative/narrativePromptBudget.js';
import {
  buildSignalRefRegistry,
  formatSignalWithRef,
  resolveRef,
} from '../domain/services/narrativeGrounding/index.js';

const DEFAULT_FACTS_MODEL = process.env.RESILIENCE_NARRATIVE_FACTS_MODEL
  ?? process.env.RESILIENCE_SELF_CHECK_MODEL
  ?? HAIKU_MODEL;

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
    '- Each claim cites ≥1 signal_ref exactly as given in the input (e.g. type@url:… or the [S#] ref shown).\n' +
    '- Do NOT invent signal_ref formats (no bare signal_type@idx:N unless that exact ref appears in input).\n' +
    '- Do NOT invent relationships between signals from different URLs.\n' +
    '- Use relation=same_article_only only when all cited refs share the same article_url.\n' +
    '- Use relation=parallel for independent observations.\n' +
    '- One claim per distinct behavioral observation; do not merge unrelated signals.\n' +
    '- No narrative prose — claims only.\n'
  );
}

/**
 * @param {{ byComponent: Record<string, object[]> }} registry
 * @param {string[]} componentIds
 * @param {string} [retrievedSpansBlock]
 * @param {string} [epistemicBlock]
 * @returns {string}
 */
export function formatFactsUserMessageForComponents(
  registry,
  componentIds,
  retrievedSpansBlock = '',
  epistemicBlock = '',
  feedback = '',
) {
  const blocks = componentIds.map((id) => {
    const def = RESILIENCE_COMPONENTS.find((c) => c.id === id);
    const label = def?.id ?? id;
    const entries = registry.byComponent[id] ?? [];
    if (entries.length === 0) {
      return `**${label}**\n(no signals)`;
    }
    const signalLines = entries.map((e) => formatSignalWithRef(e.signal, e)).join('\n\n');
    return `**${label}**\n${signalLines}`;
  });
  const prefix = [retrievedSpansBlock, epistemicBlock].filter(Boolean).join('\n');
  const prefixBlock = prefix ? `${prefix}\n\n` : '';
  const feedbackBlock = feedback
    ? `━━━ FIX THESE ISSUES FROM PRIOR ATTEMPT ━━━\n${feedback}\n\n`
    : '';
  return `${prefixBlock}${feedbackBlock}Extract narrative_claims for each component.\n\n${blocks.join('\n\n---\n\n')}`;
}

function formatFactsUserMessage(registry, retrievedSpansBlock = '', epistemicBlock = '', feedback = '') {
  return formatFactsUserMessageForComponents(
    registry,
    COMPONENT_IDS,
    retrievedSpansBlock,
    epistemicBlock,
    feedback,
  );
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

async function extractFactsForShard(registry, componentIds, opts, shardLabel) {
  const { onUsage, retrievedSpansBlock = '', epistemicBlock = '', promptBudget, feedback = '' } = opts;
  const port = resolveLlmPort(opts);
  const message = await streamMessageWithRetry(port, {
    model: DEFAULT_FACTS_MODEL,
    max_tokens: narrativeFactsMaxTokens(),
    temperature: 0,
    system: buildFactsSystemPrompt(),
    messages: [{
      role: 'user',
      content: formatFactsUserMessageForComponents(
        registry, componentIds, retrievedSpansBlock, epistemicBlock, feedback,
      ),
    }],
    callContext: {
      feature: 'narrative_facts',
      purpose: shardLabel ?? '[Step 2 — Facts]',
      promptBudget,
    },
  }, { label: shardLabel ?? '[Step 2 — Facts]' });
  if (onUsage) {
    onUsage({ label: shardLabel ?? '[Step 2 — Facts]', model: DEFAULT_FACTS_MODEL, usage: message.usage, ...transportMeta(port) });
  }
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Facts pass: no text block');
  const parsed = extractJson(textBlock.text);
  return validateFactsOutput(parsed, registry);
}

/**
 * @param {Record<string, object>} scoredComponents
 * @param {{ onUsage?: Function, llmPort?: object, factsShardSize?: number, promptBudget?: object }} [opts]
 * @returns {Promise<Record<string, object[]>>}
 */
export async function extractNarrativeFactsSharded(scoredComponents, opts = {}) {
  const registry = buildSignalRefRegistry(scoredComponents);
  if (registry.refCount === 0) return {};

  const shardSize = opts.factsShardSize ?? 4;
  const activeIds = COMPONENT_IDS.filter((id) => (registry.byComponent[id] ?? []).length > 0);
  const shards = chunkComponentIds(activeIds.length ? activeIds : COMPONENT_IDS, shardSize);

  const merged = {};
  for (let i = 0; i < shards.length; i += 1) {
    const shard = shards[i];
    const label = shards.length > 1
      ? `[Step 2 — Facts ${i + 1}/${shards.length}]`
      : '[Step 2 — Facts]';
    const partial = await extractFactsForShard(registry, shard, opts, label);
    for (const [compId, claims] of Object.entries(partial)) {
      if (!claims?.length) continue;
      merged[compId] = [...(merged[compId] ?? []), ...claims];
    }
  }
  return merged;
}

/**
 * @param {Record<string, object>} scoredComponents
 * @param {{ onUsage?: Function, llmPort?: object, client?: object, factsShardSize?: number }} [opts]
 * @returns {Promise<Record<string, object[]>>}
 */
export async function extractNarrativeFacts(scoredComponents, opts = {}) {
  if (opts.factsShardSize && opts.factsShardSize < COMPONENT_IDS.length) {
    return extractNarrativeFactsSharded(scoredComponents, opts);
  }
  const { onUsage, retrievedSpansBlock = '', epistemicBlock = '', feedback = '' } = opts;
  const registry = buildSignalRefRegistry(scoredComponents);
  if (registry.refCount === 0) return {};

  const port = resolveLlmPort(opts);
  const message = await streamMessageWithRetry(port, {
    model: DEFAULT_FACTS_MODEL,
    max_tokens: narrativeFactsMaxTokens(),
    temperature: 0,
    system: buildFactsSystemPrompt(),
    messages: [{ role: 'user', content: formatFactsUserMessage(registry, retrievedSpansBlock, epistemicBlock, feedback) }],
    callContext: { feature: 'narrative_facts', purpose: '[Step 2 — Facts]' },
  }, { label: '[Step 2 — Facts]' });
  if (onUsage) {
    onUsage({ label: '[Step 2 — Facts]', model: DEFAULT_FACTS_MODEL, usage: message.usage, ...transportMeta(port) });
  }
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Facts pass: no text block');
  const parsed = extractJson(textBlock.text);
  return validateFactsOutput(parsed, registry);
}

export { buildSignalRefRegistry as buildFactsRegistry } from '../domain/services/narrativeGrounding/index.js';
