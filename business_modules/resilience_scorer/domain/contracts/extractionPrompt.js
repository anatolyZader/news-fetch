/**
 * Extraction prompt versioning and stable prompt blocks (cache-friendly layout).
 */
import { promptCacheEnabledForFeature } from '../../../../cross-cut-modules/llm/promptCacheConfig.js';

export const EXTRACT_PROMPT_VERSION = 'extract-v3';
export const EXTRACT_PROMPT_ID = 'signal-extraction';

/**
 * Trace mode (B): when on, each extracted signal carries a model-authored `rationale`
 * and the model appends a trailing `{"_rejected": [...]}` object. Gated off by default
 * because it adds output tokens and perturbs determinism — intended for tuning runs.
 */
export function extractRationaleEnabled() {
  const v = process.env.RESILIENCE_EXTRACT_RATIONALE;
  return v === '1' || v === 'true' || v === 'full';
}

export function extractionCacheEnabled() {
  // Bypass the extraction cache when trace mode is on so B-off cached signals
  // (which lack `rationale`/`_rejected`) are never reused on a B-on run.
  if (extractRationaleEnabled()) return false;
  if (process.env.RESILIENCE_EXTRACT_CACHE === '0') return false;
  return process.env.RESILIENCE_EXTRACT_CACHE !== 'false';
}

export function extractMaxTokens() {
  const n = Number.parseInt(process.env.RESILIENCE_EXTRACT_MAX_TOKENS ?? '5000', 10);
  return Number.isFinite(n) ? Math.min(12000, Math.max(1500, n)) : 5000;
}

export function selfCheckMaxTokensCap() {
  const n = Number.parseInt(process.env.RESILIENCE_SELF_CHECK_MAX_TOKENS ?? '2000', 10);
  return Number.isFinite(n) ? Math.min(4000, Math.max(500, n)) : 2000;
}

export function extractPromptCacheEnabled() {
  return promptCacheEnabledForFeature('extract');
}

export function extractBatchEnabled() {
  return process.env.RESILIENCE_EXTRACT_BATCH === '1';
}

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
 * Condensed extraction rules (extract-v2) — stable prefix for prompt caching.
 * @param {() => string} formatDisambiguationBlock
 * @param {() => string} formatSignalCatalog
 */
export function buildCoreExtractionSystemPrompt(formatDisambiguationBlock, formatSignalCatalog) {
  return (
    `${buildCoreExtractionStablePrefix(formatDisambiguationBlock)}` +
    `━━━ SIGNAL TYPES (closed vocabulary) ━━━\n${formatSignalCatalog()}\n\n` +
    `Return only the JSON array.`
  );
}

/**
 * Historical extract-v1 stable-prefix size (rules + disambiguation, no catalog).
 * Recalibrated 2026-07-20 for catalog disambiguation growth (still the reference
 * for the “≥25% shorter” budget gate via coreExtractionStablePrefixCharBudget).
 */
export const LEGACY_STABLE_PREFIX_CHAR_BASELINE = 10_800;

export function coreExtractionStablePrefixCharBudget() {
  return Math.floor(LEGACY_STABLE_PREFIX_CHAR_BASELINE * 0.75);
}

/**
 * Trace-mode (B) prompt suffix: ask for a per-signal `rationale` plus a trailing
 * `{"_rejected": [...]}` object listing considered-but-not-emitted facts.
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
 * Cache-friendly extraction system split: stable catalog block vs dynamic content-kind prefix.
 * @param {string} contentKind
 * @param {{
 *   formatDisambiguationBlock: () => string,
 *   formatSignalCatalog: () => string,
 *   contentKindPrefix?: string,
 *   passScopeSuffix?: string,
 * }} opts
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
