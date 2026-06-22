/**
 * Sonnet polish pass: turn validated narrative_claims into operator-readable prose.
 */
import { resolveLlmPort } from '../../../cross-cut-modules/llm/resolveLlmPort.js';
import { SONNET_MODEL } from '../../../cross-cut-modules/agent/agentConfig.js';
import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import { extractJson } from './claudeJsonHelpers.js';
import { streamWithProgress } from './claudeExtraction.js';
import {
  formatSignalWithRef,
  resolveRef,
} from '../domain/services/narrativeGrounding/index.js';
import {
  componentNeedsSuppressionCompliance,
  formatSuppressionDataQualityBlock,
} from '../domain/services/narrativeGrounding/suppressionPromptContext.js';

const DEFAULT_POLISH_MODEL = process.env.RESILIENCE_NARRATIVE_POLISH_MODEL
  ?? SONNET_MODEL;

function buildPolishSystemPrompt() {
  return (
    'You write operator-readable English resilience narratives grounded in cited claims.\n' +
    'Return ONLY valid JSON:\n' +
    '{\n' +
    '  "components": [\n' +
    '    {\n' +
    '      "component_id": "<id>",\n' +
    '      "narrative_claims": [\n' +
    '        { "text": "<claim>", "signal_refs": ["type@url:…"], "relation": "parallel|same_article_only|none" }\n' +
    '      ],\n' +
    '      "evidence": ["<markdown bullet with optional source link>"],\n' +
    '      "narrative": "<1–3 connected English sentences summarizing claims; each factual sentence must include an inline markdown citation [source_label](url) using article_source or source type from signal refs — never use generic \\"source\\" when a label is known>",\n' +
    '      "data_quality_caveat": "<optional when suppression context provided>"\n' +
    '    }\n' +
    '  ],\n' +
    '  "cross_component_synthesis": "<2–4 sentences of executive prose (not bullets); name components in plain English; each factual sentence includes inline [source_label](url) citations from underlying claims>"\n' +
    '}\n\n' +
    'Rules:\n' +
    '- Preserve every input narrative_claim verbatim in narrative_claims output.\n' +
    '- Do NOT invent causal links between signals from different article URLs.\n' +
    '- Use "Separately," / parallel structure for independent observations in narrative prose.\n' +
    '- No raw multi-language evidence quotes in narrative prose — paraphrase in English.\n' +
    '- When signal refs carry narrativeContextOnly or narrative_national_context / macro_national provenance, include 1–2 sentences per component where such evidence exists: "At national level…; for northern communities this implies…" with inline [source_label](url) citations; prefix with "National press (not north-local evidence):" when the source is not scope-local.\n' +
    '- evidence[] items should echo claim text with markdown source links when URLs exist (full supporting list for drill-down).\n' +
    '- When SUPPRESSION/DATA_QUALITY block is present, include data_quality_caveat naming the limit.\n' +
    '- cross_component_synthesis: flowing prose paragraphs only — no bullet lists.\n'
  );
}

function formatClaimsBlock(mergedNarratives, registry, narrativeScored) {
  const blocks = [];
  for (const def of RESILIENCE_COMPONENTS) {
    const comp = (mergedNarratives?.components ?? []).find((c) => c.component_id === def.id);
    const claims = comp?.narrative_claims ?? [];
    if (claims.length === 0) continue;

    const claimLines = claims.map((claim) => {
      const refLines = (claim.signal_refs ?? []).map((ref) => {
        const entry = resolveRef(ref, registry);
        if (!entry) return `  ref=${ref} (unresolved)`;
        return formatSignalWithRef(entry.signal, entry);
      }).join('\n');
      return (
        `Claim: ${claim.text}\n` +
        `Relation: ${claim.relation ?? 'parallel'}\n` +
        `Signal refs:\n${refLines}`
      );
    }).join('\n\n');

    const scored = narrativeScored?.[def.id];
    let suppressionBlock = '';
    if (componentNeedsSuppressionCompliance(scored)) {
      suppressionBlock = `\n${formatSuppressionDataQualityBlock(scored)}\n`;
    }

    blocks.push(`**${def.id}**${suppressionBlock}\n${claimLines}`);
  }
  return blocks.join('\n\n---\n\n');
}

function formatPolishUserMessage(mergedNarratives, registry, narrativeScored, retrievedSpansBlock = '', feedback = '', epistemicBlock = '') {
  const prefixParts = [retrievedSpansBlock, epistemicBlock].filter(Boolean);
  const prefix = prefixParts.length > 0 ? `${prefixParts.join('\n\n')}\n\n` : '';
  const claimsBlock = formatClaimsBlock(mergedNarratives, registry, narrativeScored);
  const feedbackBlock = feedback ? `\n\nREVISION FEEDBACK:\n${feedback}\n` : '';
  return (
    `${prefix}Write operator narratives for each component from these validated claims.\n\n` +
    `${claimsBlock}${feedbackBlock}`
  );
}

function normalizePolishOutput(parsed, mergedNarratives) {
  const inputById = Object.fromEntries(
    (mergedNarratives?.components ?? []).map((c) => [c.component_id, c]),
  );
  const components = [];
  for (const block of parsed?.components ?? []) {
    const inputClaims = inputById[block.component_id]?.narrative_claims ?? block.narrative_claims ?? [];
    components.push({
      component_id: block.component_id,
      narrative_claims: inputClaims.length ? inputClaims : (block.narrative_claims ?? []),
      evidence: Array.isArray(block.evidence) ? block.evidence : [],
      narrative: String(block.narrative ?? '').trim(),
      data_quality_caveat: block.data_quality_caveat ? String(block.data_quality_caveat) : '',
    });
  }
  return {
    components,
    cross_component_synthesis: String(parsed?.cross_component_synthesis ?? '').trim(),
  };
}

/**
 * @param {object} mergedNarratives — { components: [{ component_id, narrative_claims }] }
 * @param {object} registry
 * @param {Record<string, object>} narrativeScored
 * @param {{ onUsage?: Function, llmPort?: object, retrievedSpansBlock?: string, feedback?: string, skipProgress?: boolean }} [opts]
 * @returns {Promise<{ components: object[], cross_component_synthesis: string }>}
 */
export async function polishNarrativeFromClaims(mergedNarratives, registry, narrativeScored, opts = {}) {
  const { onUsage, retrievedSpansBlock = '', feedback = '', epistemicBlock = '' } = opts;
  if (!(mergedNarratives?.components ?? []).some((c) => (c.narrative_claims ?? []).length > 0)) {
    return { components: [], cross_component_synthesis: '' };
  }

  const port = resolveLlmPort(opts);
  const userContent = formatPolishUserMessage(
    mergedNarratives,
    registry,
    narrativeScored,
    retrievedSpansBlock,
    feedback,
    epistemicBlock,
  );

  const stream = await Promise.resolve(port.stream({
    model: DEFAULT_POLISH_MODEL,
    max_tokens: 12000,
    temperature: 0,
    system: buildPolishSystemPrompt(),
    messages: [{ role: 'user', content: userContent }],
    callContext: { feature: 'narrative_polish', purpose: '[Step 3 — Polish]' },
  }));
  if (!opts.skipProgress) await streamWithProgress(stream, '[Step 3 — Polish]');
  const message = await stream.finalMessage();
  if (onUsage) {
    onUsage({ label: '[Step 3 — Polish]', model: DEFAULT_POLISH_MODEL, usage: message.usage });
  }
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Narrative polish: no text block');
  const parsed = extractJson(textBlock.text);
  return normalizePolishOutput(parsed, mergedNarratives);
}

export { DEFAULT_POLISH_MODEL };
