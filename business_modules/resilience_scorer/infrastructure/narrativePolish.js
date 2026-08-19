/**
 * Sonnet polish pass: turn validated narrative_claims into user-readable prose.
 */
import { resolveLlmPort, transportMeta } from '../../../cross-cut-modules/llm/resolveLlmPort.js';
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
      'Never bracket internal signal_ref keys (type@idx:N) — use (Field visit, date) or [hostname](url).\n' +
      '- Component-narrative sentences prefixed "National press (not north-local evidence):" or ' +
      '"Regional press (not north-local scored evidence):" are NOT scope-local evidence. Never restate ' +
      'their facts as local conditions in the synthesis. Either omit them, or confine them to one final ' +
      'sentence that keeps the same "National press (not north-local evidence):" prefix.\n'
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
      '- narrative: write 2–4 connected paragraphs per component in academic user register (topic sentence + synthesis across claims).\n'
      + '- State uncertainty explicitly when evidence is thin, contested, or context-only.\n'
      + '- Never include PBO dashboard metadata (avg=, percentage tuples) or raw Hebrew/Arabic quotes in narrative prose — paraphrase in English.\n'
    )
    : '';

  return (
    'You write user-readable English resilience narratives grounded in cited claims.\n' +
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
    '- When an ALREADY WRITTEN block is present: those observations are covered by other components. Do NOT restate them as this component\'s findings — if one is genuinely load-bearing here, reference it in a single clause ("as the leadership evidence records, …") and spend this component\'s narrative on evidence distinctive to it.\n' +
    '- Evidence whose signal refs carry narrativeContextOnly or narrative_national_context / macro_national / regional_press_context provenance is NOT scope-local evidence. NEVER blend it into sentences describing local conditions, and never open a component narrative with it. Segregate it into at most 1–2 dedicated sentences at the END of the component narrative, each starting EXACTLY with "National press (not north-local evidence):" (or "Regional press (not north-local scored evidence):" for regional_press_context), framed as "At national level…; for northern communities this implies…" with inline [source_label](url) citations. Sentences describing local conditions must cite only scope-local evidence.\n' +
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

/** Max chars of each already-written narrative echoed into later shards (anti-duplication context). */
const PRIOR_NARRATIVE_ECHO_CHARS = 700;

/**
 * Anti-duplication context for sharded polish: narratives already written by
 * earlier shards. Shards are separate LLM calls that cannot see each other —
 * without this, the same press story gets restated near-verbatim in every
 * component it routes to.
 * @param {Array<{component_id: string, narrative: string}>} priorComponents
 * @returns {string}
 */
function formatPriorNarrativesBlock(priorComponents) {
  const rows = (priorComponents ?? [])
    .filter((c) => String(c.narrative ?? '').trim())
    .map((c) => `**${c.component_id}**: ${String(c.narrative).slice(0, PRIOR_NARRATIVE_ECHO_CHARS)}`);
  if (rows.length === 0) return '';
  return `ALREADY WRITTEN (other components — do not restate these observations as this component's findings):\n${rows.join('\n\n')}`;
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
    priorNarrativesBlock = '',
  } = {},
) {
  const prefixParts = [retrievedSpansBlock, epistemicBlock, priorNarrativesBlock].filter(Boolean);
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
    `${prefix}Write user narratives for each component from these validated claims.\n\n` +
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
    priorNarrativesBlock = '',
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
      priorNarrativesBlock,
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
      ...transportMeta(port),
    });
  }
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Narrative polish: no text block');
  const parsed = extractJson(textBlock.text);
  const stopReason = message.stop_reason ?? null;
  if (stopReason === 'max_tokens') {
    console.error(`[user-narrative] Polish hit max_tokens (${progressLabel ?? 'polish'})`);
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
      priorNarrativesBlock: formatPriorNarrativesBlock(mergedComponents),
    });
    mergedComponents.push(...partial.components);
    lastStopReason = partial.stopReason;

    // A shard that answers for only some of its components used to be indistinguishable
    // from a shard that answered fully: the survivors were pushed and the rest silently
    // fell through to deterministic fallback prose. Ask once more for exactly the
    // missing ids — one refill per shard, so a component the model will not write
    // cannot spin the loop.
    const missingIds = chunkIds.filter(
      (id) => !mergedComponents.some((c) => c.component_id === id),
    );
    if (missingIds.length > 0) {
      console.error(
        `[user-narrative] Polish shard ${i + 1}/${idChunks.length} returned `
        + `${chunkIds.length - missingIds.length}/${chunkIds.length}; refilling: ${missingIds.join(', ')}`,
      );
      const refill = await invokePolishStream({
        port,
        mergedNarratives,
        registry,
        narrativeScored,
        opts: { ...opts, feedback: '' },
        includeSynthesis: false,
        componentIds: missingIds,
        progressLabel: `[Step 3 — Polish ${i + 1}/${idChunks.length} refill]`,
        priorNarrativesBlock: formatPriorNarrativesBlock(mergedComponents),
      });
      const recovered = refill.components.filter(
        (c) => missingIds.includes(c.component_id)
          && !mergedComponents.some((m) => m.component_id === c.component_id),
      );
      mergedComponents.push(...recovered);
      if (recovered.length < missingIds.length) {
        console.error(
          `[user-narrative] Polish refill recovered ${recovered.length}/${missingIds.length}; `
          + 'validation will re-ask',
        );
      }
    }
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
 * Re-ask polish for a named subset of components, no synthesis.
 *
 * Used to repair a component whose prose broke a contract (scope segregation)
 * without discarding it: the sharding heuristics in polishNarrativeFromClaims
 * decide their own component sets, so a targeted re-ask needs its own entry point.
 * The full mergedNarratives is still passed so every signal ref resolves.
 *
 * @param {object} params
 * @returns {Promise<{ components: object[], stopReason: string|null }>}
 */
export async function repolishComponents(params) {
  const {
    mergedNarratives,
    registry,
    narrativeScored,
    componentIds,
    feedback = '',
    opts = {},
    progressLabel = '[Step 3 — Polish repair]',
  } = params;
  if (!componentIds?.length) return { components: [], stopReason: null };

  const port = resolveLlmPort(opts);
  const result = await invokePolishStream({
    port,
    mergedNarratives,
    registry,
    narrativeScored,
    opts: { ...opts, feedback },
    includeSynthesis: false,
    componentIds,
    progressLabel,
  });
  return {
    components: result.components.filter((c) => componentIds.includes(c.component_id)),
    stopReason: result.stopReason ?? null,
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
