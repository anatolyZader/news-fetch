/**
 * Anti-gaming policy for citizen-sourced and high-volume signals.
 */

import { CRITICAL_BYPASS_SIGNAL_TYPES } from './highSalienceBypass.js';
import { GROUNDING_TIER } from './groundingPolicy.js';

const DEFAULT_DAILY_CAP = 20;
const DEFAULT_HOURLY_TYPE_CAP = 5;

function parseEnvInt(name, fallback) {
  const raw = Number.parseInt(process.env[name] ?? String(fallback), 10);
  return Number.isFinite(raw) ? raw : fallback;
}

export function isGamingPolicyEnabled(env = process.env) {
  return env.RESILIENCE_GAMING_POLICY !== '0';
}

export function whatsappDailyCap(_env = process.env) {
  return parseEnvInt('RESILIENCE_WHATSAPP_MAX_SIGNALS_PER_SENDER', DEFAULT_DAILY_CAP);
}

export function whatsappHourlyTypeCap(_env = process.env) {
  return parseEnvInt('RESILIENCE_WHATSAPP_HOURLY_TYPE_CAP', DEFAULT_HOURLY_TYPE_CAP);
}

/**
 * @param {string|null|undefined} phone
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isDmPhoneAllowed(phone, env = process.env) {
  const raw = env.WHATSAPP_ALLOWED_DM_PHONES;
  if (raw == null || String(raw).trim() === '') return true;
  const allow = new Set(String(raw).split(',').map((s) => s.trim()).filter(Boolean));
  return phone != null && allow.has(String(phone));
}

/**
 * Tag signals exceeding per-sender caps (whatsapp / field_whatsapp).
 * @param {Array<object>} signals
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Array<object>}
 */
export function applyWhatsappSenderCaps(signals, env = process.env) {
  if (!isGamingPolicyEnabled(env)) return signals ?? [];
  const list = Array.isArray(signals) ? signals : [];
  const dailyCap = whatsappDailyCap(env);
  const hourlyTypeCap = whatsappHourlyTypeCap(env);

  /** @type {Record<string, number>} */
  const dailyCount = {};
  /** @type {Record<string, Record<string, number>>} */
  const hourlyTypeCount = {};

  return list.map((s) => {
    const st = s?.source_type;
    if (st !== 'whatsapp' && st !== 'field_whatsapp') return s;

    const sender = s?.field_provenance?.officer_id
      ?? s?.sender_phone
      ?? s?.article_source
      ?? '_unknown';
    const dayKey = String(sender);
    dailyCount[dayKey] = (dailyCount[dayKey] ?? 0) + 1;

    const typeKey = s?.signal_type ?? s?.type ?? 'unknown';
    if (!hourlyTypeCount[dayKey]) hourlyTypeCount[dayKey] = {};
    const ht = hourlyTypeCount[dayKey];
    ht[typeKey] = (ht[typeKey] ?? 0) + 1;

    const overDaily = dailyCount[dayKey] > dailyCap;
    const overHourlyType = ht[typeKey] > hourlyTypeCap;
    if (!overDaily && !overHourlyType) return s;

    return {
      ...s,
      gaming_suspect: true,
      grounding_tier: GROUNDING_TIER.rejected,
      grounding_reason: overDaily ? 'sender_daily_cap' : 'sender_hourly_type_cap',
    };
  });
}

/**
 * Down-rank critical field_whatsapp-only signals without corroboration.
 * @param {Array<object>} signals
 * @returns {Array<object>}
 */
export function applyFieldCorroborationGaming(signals) {
  const list = Array.isArray(signals) ? signals : [];
  const hasNonWaField = list.some((s) =>
    ['field', 'pbo', 'pbo_regional', 'naftali'].includes(s?.source_type),
  );
  const hasNewsRadio = list.some((s) => ['news', 'radio'].includes(s?.source_type));

  if (hasNonWaField || hasNewsRadio) return list;

  return list.map((s) => {
    const type = s?.signal_type ?? s?.type;
    if (s?.source_type !== 'field_whatsapp') return s;
    if (!CRITICAL_BYPASS_SIGNAL_TYPES.has(type)) return s;
    if (s.grounding_tier === GROUNDING_TIER.rejected) return s;

    return {
      ...s,
      grounding_tier: GROUNDING_TIER.unverified_critical,
      grounding_reason: 'field_whatsapp_only_critical',
    };
  });
}

/**
 * @param {Array<object>} signals
 * @param {NodeJS.ProcessEnv} [env]
 */
export function applySignalGamingPolicy(signals, env = process.env) {
  let out = applyWhatsappSenderCaps(signals, env);
  out = applyFieldCorroborationGaming(out);
  return out;
}

/**
 * @param {object} signal
 * @returns {number}
 */
export function gamingContributionMultiplier(signal) {
  if (signal?.gaming_suspect === true) return 0;
  if (signal?.grounding_tier === GROUNDING_TIER.rejected) return 0;
  return 1;
}

/**
 * @param {object} signal
 * @returns {boolean}
 */
export function fieldProvenanceComplete(signal) {
  const fp = signal?.field_provenance;
  const localityKey = signal?.structured?.observation?.localityKey
    ?? signal?.localityKey;
  return Boolean(fp?.officer_id || localityKey);
}
