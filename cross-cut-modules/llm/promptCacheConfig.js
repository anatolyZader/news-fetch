/**
 * Prompt cache feature flags (Anthropic ephemeral cache_control).
 */

const ASSESS_FEATURES = new Set([
  'assess_planner',
  'assess_specialist',
  'assess_synth',
  'planner',
  'synthesizer',
  'assessment_planner',
  'assessment_specialist',
  'assessment_synthesizer',
]);

function envFlagOn(name, defaultOn = true) {
  const v = process.env[name];
  if (v == null || v === '') return defaultOn;
  if (v === '0' || v === 'false' || v === 'off') return false;
  return v === '1' || v === 'true' || v === 'on';
}

export function llmPromptCacheMasterEnabled() {
  return envFlagOn('LLM_PROMPT_CACHE', true);
}

export function minCacheableChars() {
  const n = Number.parseInt(process.env.LLM_PROMPT_CACHE_MIN_CHARS ?? '2048', 10);
  return Number.isFinite(n) && n > 0 ? n : 2048;
}

/**
 * @param {string} [feature]
 */
export function promptCacheEnabledForFeature(feature) {
  if (!llmPromptCacheMasterEnabled()) return false;
  const f = String(feature ?? '').trim().toLowerCase();
  if (!f) return true;

  if (f === 'extract' || f.startsWith('extract')) {
    return envFlagOn('RESILIENCE_EXTRACT_PROMPT_CACHE', true);
  }
  if (f === 'chat' || f.startsWith('chat')) {
    return envFlagOn('CHAT_PROMPT_CACHE', true);
  }
  if (ASSESS_FEATURES.has(f) || f.startsWith('specialist:') || f.includes('assess')) {
    return envFlagOn('RESILIENCE_ASSESS_PROMPT_CACHE', true);
  }
  if (f === 'validation' || f.startsWith('validation')) {
    return envFlagOn('RESILIENCE_ASSESS_PROMPT_CACHE', true);
  }
  return true;
}
