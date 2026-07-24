/**
 * Preflight token budgeting and degrade ladder for closed-core / hybrid narrative LLM calls.
 *
 * Pipeline position: before narrative LLM invocation — selects digest cap, shard sizes,
 * and whether to skip LLM entirely when budget exhausted.
 *
 * Owns: DEGRADE_LEVELS ladder, token estimates, resolveNarrativeContextPlan.
 * Does NOT: invoke LLM or validate narrative JSON output.
 *
 * Key collaborators: `narrative/buildFullSignalDigest.js`, `narrative/signalRefRegistry.js`,
 * cross-cut-modules/retrieval RAG config.
 */

import { COMPONENT_IDS } from '../../contracts/componentIds.js';
import { RESILIENCE_COMPONENTS } from '../../resilienceComponents.js';
import { buildFullSignalDigest, narrativeDigestEvidenceChars, narrativeDigestSignalCap } from './buildFullSignalDigest.js';
import {
  buildSignalRefRegistry,
  formatSignalWithRef,
} from './signalRefRegistry.js';
import { resilienceNarrativeRagEnabled, resilienceNarrativeRagTopK } from '../../../../../cross-cut-modules/retrieval/ragConfig.js';

/** Conservative static overhead (facts/polish system prompts + rules blocks). */
const STATIC_RULES_CHARS = 14_000;

// ── Env readers ───────────────────────────────────────────────────────────────

/**
 * Max estimated tokens for a single narrative LLM call.
 *
 * @returns {number}
 */
export function narrativeContextMaxTokens() {
  const n = Number.parseInt(process.env.RESILIENCE_NARRATIVE_CONTEXT_MAX_TOKENS ?? '180000', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200_000) : 180_000;
}

/**
 * @returns {number}
 */
export function narrativeCharsPerToken() {
  const n = Number.parseFloat(process.env.RESILIENCE_NARRATIVE_CHARS_PER_TOKEN ?? '3.5');
  return Number.isFinite(n) && n > 0 ? n : 3.5;
}

/**
 * @returns {number}
 */
export function narrativeFactsShardSize() {
  const n = Number.parseInt(process.env.RESILIENCE_NARRATIVE_FACTS_SHARD_SIZE ?? '4', 10);
  return Number.isFinite(n) && n >= 2 ? n : 4;
}

/**
 * @param {string|null|undefined} text
 * @returns {number}
 */
export function estimateTextTokens(text) {
  return estimateCharsTokens(String(text ?? '').length);
}

/**
 * @param {number} charCount
 * @returns {number}
 */
function estimateCharsTokens(charCount) {
  if (!charCount) return 0;
  return Math.ceil(charCount / narrativeCharsPerToken());
}

/**
 * @param {string[]} componentIds
 * @param {number} shardSize
 * @returns {string[][]}
 */
export function chunkComponentIds(componentIds, shardSize) {
  const chunks = [];
  for (let i = 0; i < componentIds.length; i += shardSize) {
    chunks.push(componentIds.slice(i, i + shardSize));
  }
  return chunks;
}

/** Degrade ladder settings from full context down to skip-LLM stub claims. */
/** @type {Array<object>} */
export const DEGRADE_LEVELS = [
  {
    digestCap: 15,
    evidenceChars: 500,
    ragEnabled: true,
    factsEnabled: true,
    judgeEnabled: true,
    polishShardSize: 4,
    factsShardSize: 4,
    useStubClaims: false,
    skipLlm: false,
  },
  {
    digestCap: 10,
    evidenceChars: 300,
    ragEnabled: true,
    factsEnabled: true,
    judgeEnabled: true,
    polishShardSize: 4,
    factsShardSize: 4,
    useStubClaims: false,
    skipLlm: false,
  },
  {
    digestCap: 6,
    evidenceChars: 200,
    ragEnabled: false,
    factsEnabled: true,
    judgeEnabled: true,
    polishShardSize: 4,
    factsShardSize: 4,
    useStubClaims: false,
    skipLlm: false,
  },
  {
    digestCap: 6,
    evidenceChars: 200,
    ragEnabled: false,
    factsEnabled: false,
    judgeEnabled: false,
    polishShardSize: 4,
    factsShardSize: 4,
    useStubClaims: true,
    skipLlm: false,
  },
  {
    digestCap: 6,
    evidenceChars: 200,
    ragEnabled: false,
    factsEnabled: false,
    judgeEnabled: false,
    polishShardSize: 2,
    factsShardSize: 2,
    useStubClaims: true,
    skipLlm: false,
  },
  {
    digestCap: 6,
    evidenceChars: 200,
    ragEnabled: false,
    factsEnabled: false,
    judgeEnabled: false,
    polishShardSize: 2,
    factsShardSize: 2,
    useStubClaims: true,
    skipLlm: true,
  },
];

/**
 * @param {number} level
 * @returns {object}
 */
export function settingsForDegradeLevel(level) {
  const idx = Math.max(0, Math.min(level, DEGRADE_LEVELS.length - 1));
  const base = DEGRADE_LEVELS[idx];
  const envDigest = narrativeDigestSignalCap();
  const envEvidence = narrativeDigestEvidenceChars();
  return {
    ...base,
    digestCap: Math.min(base.digestCap, envDigest),
    evidenceChars: Math.min(base.evidenceChars, envEvidence),
    degradeLevel: idx,
  };
}

/**
 * @param {{ byComponent: Record<string, object[]> }} registry
 * @param {string[]} [componentIds]
 * @returns {string}
 */
export function formatSignalsBlockForEstimate(registry, componentIds = COMPONENT_IDS) {
  const lines = [];
  for (const id of componentIds) {
    const entries = registry?.byComponent?.[id] ?? [];
    for (const entry of entries) {
      lines.push(formatSignalWithRef(entry.signal, entry));
    }
  }
  return lines.join('\n\n');
}

/**
 * @param {object[]} macroSignals
 * @returns {string}
 */
function formatMacroBlockForEstimate(macroSignals) {
  return (macroSignals ?? []).slice(0, 25).map((s) => {
    const ev = String(s.evidence ?? '').slice(0, 220);
    return `  [${s.signal_type ?? s.type ?? 'macro'}] ${ev}`;
  }).join('\n');
}

/**
 * @param {boolean} ragEnabled
 * @returns {number}
 */
function estimateRagTokens(ragEnabled) {
  if (!ragEnabled || !resilienceNarrativeRagEnabled()) return 0;
  const perComponentChars = resilienceNarrativeRagTopK() * 500;
  return estimateCharsTokens(perComponentChars * RESILIENCE_COMPONENTS.length);
}

/**
 * @param {object} params
 * @returns {object}
 */
export function estimateNarrativePromptSections(params) {
  const {
    narrativeScored,
    registry,
    settings,
    macroSignals = [],
    componentIds = COMPONENT_IDS,
  } = params;

  const signalsText = formatSignalsBlockForEstimate(registry, componentIds);
  const signals_block = estimateTextTokens(signalsText);
  const rules_block = estimateCharsTokens(STATIC_RULES_CHARS);
  const macro_block = estimateTextTokens(formatMacroBlockForEstimate(macroSignals));
  const rag_block = estimateRagTokens(settings?.ragEnabled !== false);
  const registry_count = registry?.refCount ?? 0;

  const factsShardSize = settings?.factsShardSize ?? narrativeFactsShardSize();
  const factShards = chunkComponentIds(
    COMPONENT_IDS.filter((id) => (registry?.byComponent?.[id] ?? []).length > 0),
    factsShardSize,
  );
  let worst_facts_shard = 0;
  for (const shard of factShards.length ? factShards : [COMPONENT_IDS]) {
    const shardSignals = estimateTextTokens(formatSignalsBlockForEstimate(registry, shard));
    worst_facts_shard = Math.max(worst_facts_shard, rules_block + shardSignals + macro_block + rag_block);
  }

  const polishShardSize = settings?.polishShardSize ?? 4;
  const polishShards = chunkComponentIds(
    COMPONENT_IDS.filter((id) => (narrativeScored?.[id]?.signals ?? []).length > 0),
    polishShardSize,
  );
  let worst_polish_shard = 0;
  for (const shard of polishShards.length ? polishShards : [COMPONENT_IDS]) {
    const shardSignals = estimateTextTokens(formatSignalsBlockForEstimate(registry, shard));
    worst_polish_shard = Math.max(worst_polish_shard, rules_block + shardSignals + macro_block + rag_block);
  }

  return {
    rules_block,
    signals_block,
    rag_block,
    macro_block,
    registry_count,
    worst_facts_shard,
    worst_polish_shard,
    worst_call_estimated: Math.max(worst_facts_shard, worst_polish_shard),
  };
}

// ── Context plan resolution ───────────────────────────────────────────────────

/**
 * Walk degrade ladder until narrative prompt fits token budget or skip LLM.
 *
 * @param {object} params
 * @param {object[]} params.narrativeScopeSignals
 * @param {Record<string, object>} params.scoredFull
 * @param {object} [params.scoringContext]
 * @param {object[]} [params.macroSignals]
 * @param {number} [params.startLevel]
 * @returns {object}
 */
export function resolveNarrativeContextPlan(params) {
  const {
    narrativeScopeSignals,
    scoredFull,
    scoringContext = null,
    macroSignals = [],
    startLevel = 0,
  } = params;

  const maxTokens = narrativeContextMaxTokens();
  const context = scoringContext ?? scoredFull;

  const lastLevel = DEGRADE_LEVELS.length - 1;
  for (let level = Math.min(startLevel, lastLevel); level <= lastLevel; level += 1) {
    const settings = settingsForDegradeLevel(level);
    const narrativeScored = buildFullSignalDigest(narrativeScopeSignals, context, {
      digestCap: settings.digestCap,
      evidenceChars: settings.evidenceChars,
    });
    const registry = buildSignalRefRegistry(narrativeScored);
    const section_estimates = estimateNarrativePromptSections({
      narrativeScored,
      registry,
      settings,
      macroSignals,
    });

    const plan = {
      ...settings,
      narrativeScored,
      registry,
      section_estimates,
    };

    if (settings.skipLlm || level === lastLevel) {
      console.error(
        `  → Narrative preflight: level ${level} skip LLM (budget ladder exhausted)`,
      );
      return plan;
    }

    if (section_estimates.worst_call_estimated <= maxTokens) {
      console.error(
        `  → Narrative preflight: level ${level} ok `
        + `(~${section_estimates.worst_call_estimated} tokens ≤ ${maxTokens}, `
        + `registry=${registry.refCount}, digest=${settings.digestCap})`,
      );
      return plan;
    }

    console.error(
      `  → Narrative preflight: level ${level} over budget `
      + `(~${section_estimates.worst_call_estimated} > ${maxTokens}); escalating`,
    );
  }
}

/**
 * @param {object} plan
 * @param {object} params — same shape as resolveNarrativeContextPlan
 * @returns {object}
 */
export function escalateNarrativeContextPlan(plan, params) {
  const nextLevel = (plan?.degradeLevel ?? 0) + 1;
  return resolveNarrativeContextPlan({ ...params, startLevel: nextLevel });
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTokenOverflowError(err) {
  const msg = String(err?.message ?? err ?? '');
  return /prompt is too long|200[\s,_]?000|context length|maximum.*tokens|token.*limit/i.test(msg);
}
