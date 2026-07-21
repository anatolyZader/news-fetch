/**
 * Extraction prompt versioning, env gates, and cache-friendly prompt blocks.
 *
 * Pipeline position: extract path — assembles stable LLM system prompts for closed-
 * vocabulary signal extraction. Server-side (process.env, cross-cut llm config).
 *
 * Owns: EXTRACT_PROMPT_VERSION, stable prefix builders, token/cache env helpers.
 * Does NOT: signal catalog content (signalCatalog.js) or post-extract validation.
 *
 * Key collaborators: signalCatalogPrompt.js, closedCatalogueExtractService.js,
 * extractionPasses.js, cross-cut-modules/llm/promptCacheConfig.js.
 */
import { promptCacheEnabledForFeature } from '../../../../cross-cut-modules/llm/promptCacheConfig.js';

/** Current extraction prompt version identifier. */
export const EXTRACT_PROMPT_VERSION = 'extract-v3';

/** Stable prompt id for telemetry and cache keys. */
export const EXTRACT_PROMPT_ID = 'signal-extraction';

/**
 * Return true when trace mode (per-signal rationale + _rejected block) is enabled.
 * Gated off by default — adds tokens and perturbs determinism.
 * @returns {boolean}
 */
export function extractRationaleEnabled() {
  const v = process.env.RESILIENCE_EXTRACT_RATIONALE;
  return v === '1' || v === 'true' || v === 'full';
}

/**
 * Return true when extraction response caching is enabled (disabled in trace mode).
 * @returns {boolean}
 */
export function extractionCacheEnabled() {
  // Bypass the extraction cache when trace mode is on so B-off cached signals
  // (which lack `rationale`/`_rejected`) are never reused on a B-on run.
  if (extractRationaleEnabled()) return false;
  if (process.env.RESILIENCE_EXTRACT_CACHE === '0') return false;
  return process.env.RESILIENCE_EXTRACT_CACHE !== 'false';
}

/**
 * Resolved max output tokens for extraction LLM calls (env-clamped).
 * @returns {number}
 */
export function extractMaxTokens() {
  const n = Number.parseInt(process.env.RESILIENCE_EXTRACT_MAX_TOKENS ?? '5000', 10);
  return Number.isFinite(n) ? Math.min(12000, Math.max(1500, n)) : 5000;
}

/**
 * Resolved max tokens cap for extraction self-check pass (env-clamped).
 * @returns {number}
 */
export function selfCheckMaxTokensCap() {
  const n = Number.parseInt(process.env.RESILIENCE_SELF_CHECK_MAX_TOKENS ?? '2000', 10);
  return Number.isFinite(n) ? Math.min(4000, Math.max(500, n)) : 2000;
}

/**
 * Return true when Anthropic prompt caching is enabled for extract feature.
 * @returns {boolean}
 */
export function extractPromptCacheEnabled() {
  return promptCacheEnabledForFeature('extract');
}

/**
 * Return true when batched multi-article extraction is enabled.
 * @returns {boolean}
 */
export function extractBatchEnabled() {
  return process.env.RESILIENCE_EXTRACT_BATCH === '1';
}

/**
 * Build the cache-stable extraction rules prefix (no catalog — disambiguation only).
 * @param {() => string} formatDisambiguationBlock
 * @returns {string}
 */
export function buildCoreExtractionStablePrefix(formatDisambiguationBlock) {
  return (
    `You are a behavioral signal extractor for Israeli community resilience under emergency.\n` +
    `Extract ATOMIC signals using CLOSED vocabulary. Return JSON array only — no prose.\n\n` +
    `EVIDENCE TYPES: direct_quote_named_person | named_survey_statistic | ` +
    `named_institutional_fact | observational_reported_fact\n\n` +
    `RULES:\n` +
    `- One behavioral fact per signal; split compounds\n` +
    `- People injured/wounded/killed (נפצעו, נפגעים, casualties) → harm_to_population; ` +
    `building/school/kindergarten/infrastructure damaged (ניזוק, building hit) → infrastructure_damage_acute — separate signals when both appear\n` +
    `- EXCLUDE: criminal/street violence (אירוע אלימות, מטווח אפס, מרדף) unless war attack framing; ` +
    `national EMS aggregate counts (מגן דוד אדום treated N since operation start)\n` +
    `- Do NOT emit one signal per siren/missile round or city-list alert activation — abstain on pure hazard tickers; ` +
    `extract behavior (compliance_*, complacency_or_normalization), outcomes (harm_to_population, infrastructure_damage_acute), ` +
    `or warning-system facts (early_warning_system_*) when distinct; use scope_level repeated_pattern for sustained routine erosion from field visits\n` +
    `- signal_type from catalog only; never invent types\n` +
    `- Scope: Israeli civilian emergency behavior only\n` +
    `- EXCLUDE: military ops abroad, soldier casualties/eulogies, foreign populations, ` +
    `general political punditry without civilian emergency behavior\n` +
    `- EXCLUDE: journalist mood without observable civilian facts\n` +
    `- fear_expression/calm_confidence require named person (direct_quote_named_person)\n\n` +
    `OUTPUT FIELDS: article_index, signal_type, evidence_type, evidence (verbatim quote), ` +
    `scope_level, confidence (0-1), locality. Return [] if none.\n` +
    `- locality: the Israeli town/city/community/region where the described civilian behavior ` +
    `actually occurs (Hebrew or English, as written in the text). Set null when the signal is ` +
    `national in scope or no specific place is identifiable. Do NOT infer locality from a place ` +
    `merely named in passing, quoted by a pundit, or discussed in studio — only when the behavior ` +
    `happens there.\n\n` +
    `━━━ CLASSIFICATION ━━━\n${formatDisambiguationBlock()}\n\n`
  );
}

/**
 * Full extraction system prompt: stable rules prefix plus closed catalog block.
 * @param {() => string} formatDisambiguationBlock
 * @param {() => string} formatSignalCatalog
 * @returns {string}
 */
export function buildCoreExtractionSystemPrompt(formatDisambiguationBlock, formatSignalCatalog) {
  return (
    `${buildCoreExtractionStablePrefix(formatDisambiguationBlock)}` +
    `━━━ SIGNAL TYPES (closed vocabulary) ━━━\n${formatSignalCatalog()}\n\n` +
    `Return only the JSON array.`
  );
}

/**
 * Historical extract-v1 stable-prefix char baseline for cache budget gate
 * (coreExtractionStablePrefixCharBudget targets ≥25% shorter).
 */
export const LEGACY_STABLE_PREFIX_CHAR_BASELINE = 10_800;

/**
 * Max allowed stable-prefix character count (75% of legacy baseline).
 * @returns {number}
 */
export function coreExtractionStablePrefixCharBudget() {
  return Math.floor(LEGACY_STABLE_PREFIX_CHAR_BASELINE * 0.75);
}

/**
 * Trace-mode prompt suffix: per-signal rationale + trailing _rejected JSON object.
 * @returns {string}
 */
export function buildRationaleInstructionSuffix() {
  return (
    `\n\n━━━ TRACE MODE (rationale capture) ━━━\n` +
    `For EACH signal object, ALSO include a "rationale" field: one short clause (under 20 words) ` +
    `explaining why this evidence is a valid instance of its signal_type.\n` +
    `AFTER the JSON array, on a NEW line, output a single JSON object listing facts you considered ` +
    `but did NOT emit as signals:\n` +
    `{"_rejected":[{"text":"<the fact or quote>","why":"<short reason it was not emitted>"}]}\n` +
    `Use {"_rejected":[]} when nothing was considered and rejected.`
  );
}

/**
 * Split extraction system prompt into cache-stable and dynamic parts for Anthropic caching.
 * @param {string} contentKind
 * @param {{
 *   formatDisambiguationBlock: () => string,
 *   formatSignalCatalog: () => string,
 *   contentKindPrefix?: string,
 *   passScopeSuffix?: string,
 * }} opts
 * @returns {{ stable: string, dynamic: string }}
 */
export function buildExtractionSystemParts(_contentKind, opts) {
  let stable = buildCoreExtractionSystemPrompt(
    opts.formatDisambiguationBlock,
    opts.formatSignalCatalog,
  );
  if (opts.passScopeSuffix) {
    stable += `\n\n${opts.passScopeSuffix}`;
  }
  if (extractRationaleEnabled()) {
    stable += buildRationaleInstructionSuffix();
  }
  const dynamic = String(opts.contentKindPrefix ?? '');
  return { stable, dynamic };
}
