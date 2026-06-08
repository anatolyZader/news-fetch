/**
 * Extraction prompt versioning and stable prompt blocks (cache-friendly layout).
 */
export const EXTRACT_PROMPT_VERSION = 'extract-v2';
export const EXTRACT_PROMPT_ID = 'signal-extraction';

export function extractionCacheEnabled() {
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
  return process.env.RESILIENCE_EXTRACT_PROMPT_CACHE === '1';
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
    `- signal_type from catalog only; never invent types\n` +
    `- Scope: Israeli civilian emergency behavior only\n` +
    `- EXCLUDE: military ops abroad, soldier casualties/eulogies, foreign populations, ` +
    `general political punditry without civilian emergency behavior\n` +
    `- EXCLUDE: journalist mood without observable civilian facts\n` +
    `- fear_expression/calm_confidence require named person (direct_quote_named_person)\n\n` +
    `OUTPUT FIELDS: article_index, signal_type, evidence_type, evidence (verbatim quote), ` +
    `scope_level, confidence (0-1). Return [] if none.\n\n` +
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

/** Pre-extract-v2 stable prefix size (rules + disambiguation, no catalog). */
export const LEGACY_STABLE_PREFIX_CHAR_BASELINE = 10_500;

export function coreExtractionStablePrefixCharBudget() {
  return Math.floor(LEGACY_STABLE_PREFIX_CHAR_BASELINE * 0.75);
}
