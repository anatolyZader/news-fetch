/**
 * Sonnet polish pass: turn validated narrative_claims into operator-readable prose.
 */
import { resolveLlmPort } from '../../../cross-cut-modules/llm/resolveLlmPort.js';
import { SONNET_MODEL } from '../../../cross-cut-modules/llm/modelIds.js';
import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import { extractJson } from './claudeJsonHelpers.js';
import { streamMessageWithRetry } from './llmStreamCall.js';
import {
  formatSignalWithRef,
  resolveRef,
} from '../domain/services/narrativeGrounding/index.js';

const DEFAULT_POLISH_MODEL = process.env.RESILIENCE_NARRATIVE_POLISH_MODEL
  ?? SONNET_MODEL;

function polishMaxTokens() {
  const n = Number.parseInt(process.env.RESILIENCE_NARRATIVE_POLISH_MAX_TOKENS ?? '16000', 10);
  return Number.isFinite(n) ? Math.min(64_000, Math.max(4096, n)) : 16_000;
}

function polishShardSize() {
  const n = Number.parseInt(process.env.RESILIENCE_POLISH_SHARD_SIZE ?? '4', 10);
  return Number.isFinite(n) && n >= 2 ? n : 4;
}

function polishShardMinComponents() {
  const n = Number.parseInt(process.env.RESILIENCE_POLISH_SHARD_MIN_COMPONENTS ?? '5', 10);
  return Number.isFinite(n) && n >= 3 ? n : 5;
}

function academicProseStyleEnabled() {
  const v = String(process.env.RESILIENCE_NARRATIVE_PROSE_STYLE ?? 'academic').trim().toLowerCase();
  return v !== '0' && v !== 'off' && v !== 'legacy';
}

function narrativeFieldSpec() {
  if (academicProseStyleEnabled()) {
    return (
      '      "narrative": "<2–4 connected English paragraphs synthesizing component state; '
      + 'open with a topic sentence; paraphrase claims in academic register; '
      + 'each factual sentence must include an inline markdown citation [source_label](url) '
      + 'using article_source or source type from signal refs — never use generic \\"source\\" when a label is known>",\n'
    );
  }
  return (
    '      "narrative": "<1–3 connected English sentences summarizing claims; each factual sentence must include an inline markdown citation [source_label](url) using article_source or source type from signal refs — never use generic \\"source\\" when a label is known>",\n'
  );
}

function buildPolishSystemPrompt({ includeSynthesis = true, synthesisOnly = false } = {}) {
  if (synthesisOnly) {
    return (
      'Return ONLY valid JSON:\n' +
      '{ "cross_component_synthesis": "<2–4 sentences of executive prose>" }\n' +
      'No bullet lists. Include inline [source_label](url) citations when URLs are known from input.\n' +
      'Never use [S#] signal labels — always [article_source or hostname](url).\n' +
      'Never bracket internal signal_ref keys (type@idx:N) — use (Field visit, date) or [hostname](url).\n'
    );
  }

  const synthesisBlock = includeSynthesis
    ? (
      '  "cross_component_synthesis": "<2–4 sentences of executive prose (not bullets); name components in plain English; each factual sentence includes inline [source_label](url) citations from underlying claims>"\n'
    )
    : '';
  const synthesisRules = includeSynthesis
    ? '- cross_component_synthesis: flowing prose paragraphs only — no bullet lists.\n'
    : '- Omit cross_component_synthesis (return only components).\n';

  const academicRules = academicProseStyleEnabled()
    ? (
      '- narrative: write 2–4 connected paragraphs per component in academic operator register (topic sentence + synthesis across claims).\n'
      + '- State uncertainty explicitly when evidence is thin, contested, or context-only.\n'
      + '- Never include PBO dashboard metadata (avg=, percentage tuples) or raw Hebrew/Arabic quotes in narrative prose — paraphrase in English.\n'
    )
    : '';

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
    narrativeFieldSpec() +
    '      "data_quality_caveat": "<optional when concentration context provided>"\n' +
    '    }\n' +
    '  ],\n' +
    synthesisBlock +
    '}\n\n' +
    'Rules:\n' +
    '- Preserve every input narrative_claim verbatim in narrative_claims output.\n' +
    '- Do NOT invent causal links between signals from different article URLs.\n' +
    '- Use "Separately," / parallel structure for independent observations in narrative prose.\n' +
    '- No raw multi-language evidence quotes in narrative prose — paraphrase in English.\n' +
    '- Never use [S#] signal labels in narrative or cross_component_synthesis prose — always cite as [article_source or hostname](url).\n' +
    '- Never put internal signal_ref keys (signal_type@idx:N, type@url:…) in narrative prose brackets. For URL-less field evidence cite as (Field visit, date); for press cite as [hostname](url).\n' +
    '- Every narrative_claim with press/news/radio signal_refs must include a matching in-text citation in narrative prose.\n' +
    academicRules +
    '- When signal refs carry narrativeContextOnly or narrative_national_context / macro_national / regional_press_context provenance, include 1–2 sentences per component where such evidence exists: "At national level…; for northern communities this implies…" with inline [source_label](url) citations; prefix with "National press (not north-local evidence):" when the source is not scope-local; prefix regional_press_context with "Regional press (not north-local scored evidence):".\n' +
    '- evidence[] items should echo claim text with markdown source links when URLs exist (full supporting list for drill-down).\n' +
    '- When a CONCENTRATED EVIDENCE block is present, include data_quality_caveat naming the dominant outlet/source type.\n' +
    synthesisRules
  );
}

function formatClaimsBlock(mergedNarratives, registry, narrativeScored, componentIds = null) {
  const idSet = componentIds ? new Set(componentIds) : null;
  const blocks = [];
  for (const def of RESILIENCE_COMPONENTS) {
    if (idSet && !idSet.has(def.id)) continue;
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
    const cw = scored?.evidence_basis?.concentration_warning;
    const concentrationBlock = cw
      ? `\nCONCENTRATED EVIDENCE: ${cw.layer}=${cw.key} holds ${Math.round(cw.share * 100)}% of this component's signals.\n`
      : '';

    blocks.push(`**${def.id}**${concentrationBlock}\n${claimLines}`);
  }
  return blocks.join('\n\n---\n\n');
}

function formatPolishUserMessage(
  mergedNarratives,
  registry,
  narrativeScored,
  {
    retrievedSpansBlock = '',
    feedback = '',
    epistemicBlock = '',
    componentIds = null,
    synthesisOnly = false,
  } = {},
) {
  const prefixParts = [retrievedSpansBlock, epistemicBlock].filter(Boolean);
  const prefix = prefixParts.length > 0 ? `${prefixParts.join('\n\n')}\n\n` : '';
  const feedbackBlock = feedback ? `\n\nREVISION FEEDBACK:\n${feedback}\n` : '';

  if (synthesisOnly) {
    const summaryLines = (mergedNarratives?.components ?? [])
      .filter((c) => String(c.narrative ?? '').trim())
      .map((c) => `**${c.component_id}**: ${c.narrative}`);
    return (
      `${prefix}Write cross_component_synthesis only from these component narratives.\n\n` +
      `${summaryLines.join('\n\n')}${feedbackBlock}`
    );
  }

  const claimsBlock = formatClaimsBlock(mergedNarratives, registry, narrativeScored, componentIds);
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

function componentsWithClaims(mergedNarratives) {
  return (mergedNarratives?.components ?? []).filter((c) => (c.narrative_claims ?? []).length > 0);
}

function chunkComponentIds(ids, size) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/**
 * @param {object} params
 * @returns {Promise<{ components: object[], cross_component_synthesis: string, stopReason: string|null }>}
 */
async function invokePolishStream(params) {
  const {
    port,
    mergedNarratives,
    registry,
    narrativeScored,
    opts,
    includeSynthesis,
    componentIds,
    synthesisOnly,
    progressLabel,
  } = params;

  const userContent = formatPolishUserMessage(
    mergedNarratives,
    registry,
    narrativeScored,
    {
      retrievedSpansBlock: opts.retrievedSpansBlock ?? '',
      feedback: opts.feedback ?? '',
      epistemicBlock: opts.epistemicBlock ?? '',
      componentIds,
      synthesisOnly,
    },
  );

  const message = await streamMessageWithRetry(port, {
    model: DEFAULT_POLISH_MODEL,
    max_tokens: polishMaxTokens(),
    temperature: 0,
    system: buildPolishSystemPrompt({ includeSynthesis, synthesisOnly }),
    messages: [{ role: 'user', content: userContent }],
    callContext: {
      feature: 'narrative_polish',
      purpose: progressLabel ?? '[Step 3 — Polish]',
    },
  }, { label: progressLabel ?? '[Step 3 — Polish]', skipProgress: opts.skipProgress });
  if (opts.onUsage) {
    opts.onUsage({
      label: progressLabel ?? '[Step 3 — Polish]',
      model: DEFAULT_POLISH_MODEL,
      usage: message.usage,
    });
  }
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Narrative polish: no text block');
  const parsed = extractJson(textBlock.text);
  const stopReason = message.stop_reason ?? null;
  if (stopReason === 'max_tokens') {
    console.error(`[operator-narrative] Polish hit max_tokens (${progressLabel ?? 'polish'})`);
  }
  return {
    ...normalizePolishOutput(parsed, mergedNarratives),
    stopReason,
  };
}

async function polishSharded(mergedNarratives, registry, narrativeScored, opts) {
  const port = resolveLlmPort(opts);
  const withClaims = componentsWithClaims(mergedNarratives);
  const shardSize = opts.shardSize ?? polishShardSize();
  const idChunks = chunkComponentIds(withClaims.map((c) => c.component_id), shardSize);

  const mergedComponents = [];
  let lastStopReason = null;

  for (let i = 0; i < idChunks.length; i += 1) {
    const chunkIds = idChunks[i];
    const isLast = i === idChunks.length - 1;
    const partial = await invokePolishStream({
      port,
      mergedNarratives,
      registry,
      narrativeScored,
      opts: { ...opts, feedback: isLast ? opts.feedback : '' },
      includeSynthesis: false,
      componentIds: chunkIds,
      progressLabel: `[Step 3 — Polish ${i + 1}/${idChunks.length}]`,
    });
    mergedComponents.push(...partial.components);
    lastStopReason = partial.stopReason;
  }

  const forSynthesis = {
    components: mergedComponents.map((c) => {
      const input = withClaims.find((x) => x.component_id === c.component_id);
      return {
        component_id: c.component_id,
        narrative_claims: input?.narrative_claims ?? c.narrative_claims ?? [],
        narrative: c.narrative,
        evidence: c.evidence,
        data_quality_caveat: c.data_quality_caveat,
      };
    }),
  };

  const synthesisResult = await invokePolishStream({
    port,
    mergedNarratives: forSynthesis,
    registry,
    narrativeScored,
    opts,
    includeSynthesis: true,
    synthesisOnly: true,
    progressLabel: '[Step 3 — Polish synthesis]',
  });

  return {
    components: mergedComponents,
    cross_component_synthesis: synthesisResult.cross_component_synthesis,
    stopReason: synthesisResult.stopReason ?? lastStopReason,
  };
}

/**
 * @param {object} mergedNarratives — { components: [{ component_id, narrative_claims }] }
 * @param {object} registry
 * @param {Record<string, object>} narrativeScored
 * @param {{ onUsage?: Function, llmPort?: object, retrievedSpansBlock?: string, feedback?: string, skipProgress?: boolean }} [opts]
 * @returns {Promise<{ components: object[], cross_component_synthesis: string, stopReason?: string|null }>}
 */
export async function polishNarrativeFromClaims(mergedNarratives, registry, narrativeScored, opts = {}) {
  const { onUsage, retrievedSpansBlock = '', feedback = '', epistemicBlock = '' } = opts;
  if (!componentsWithClaims(mergedNarratives).length) {
    return { components: [], cross_component_synthesis: '', stopReason: null };
  }

  const llmOpts = {
    onUsage,
    retrievedSpansBlock,
    feedback,
    epistemicBlock,
    skipProgress: opts.skipProgress,
    llmPort: opts.llmPort,
    client: opts.client,
    shardSize: opts.shardSize,
    shardMinComponents: opts.shardMinComponents,
    promptBudget: opts.promptBudget,
  };

  const claimCount = componentsWithClaims(mergedNarratives).length;
  const shardMin = opts.shardMinComponents ?? polishShardMinComponents();
  const forceShard = opts.shardSize != null && opts.shardSize < claimCount;
  if (claimCount >= shardMin || forceShard) {
    return polishSharded(mergedNarratives, registry, narrativeScored, llmOpts);
  }

  const port = resolveLlmPort(opts);
  return invokePolishStream({
    port,
    mergedNarratives,
    registry,
    narrativeScored,
    opts: llmOpts,
    includeSynthesis: true,
  });
}

export {
  DEFAULT_POLISH_MODEL,
  polishMaxTokens,
  polishShardMinComponents,
  polishShardSize,
  buildPolishSystemPrompt,
};
