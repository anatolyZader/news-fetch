/**
 * Anti-gaming policy for citizen-sourced and high-volume WhatsApp/field signals.
 *
 * Pipeline position: assess — post-verification tagging before scope filter and evidence partition.
 *
 * Owns: per-sender daily/hourly caps, field_whatsapp-only critical down-ranking via grounding_tier.
 * Does NOT: probe corroboration (probeCorroborationPolicy.js), open-evidence verification, or routing.
 *
 * Key collaborators: groundingPolicy.js, probeCorroborationPolicy.js, ../../epistemic/highSalienceBypass.js, ../../contracts/gamingPolicy.js.
 */

import { CRITICAL_BYPASS_SIGNAL_TYPES } from '../../epistemic/highSalienceBypass.js';
import { GROUNDING_TIER } from './groundingPolicy.js';

const DEFAULT_DAILY_CAP = 20;
const DEFAULT_HOURLY_TYPE_CAP = 5;

function parseEnvInt(name, fallback) {
  const raw = Number.parseInt(process.env[name] ?? String(fallback), 10);
  return Number.isFinite(raw) ? raw : fallback;
}

/**
 * Whether gaming policy is enabled (env RESILIENCE_GAMING_POLICY).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isGamingPolicyEnabled(env = process.env) {
  return env.RESILIENCE_GAMING_POLICY !== '0';
}

/**
 * Max signals per sender per day for WhatsApp sources.
 *
 * @param {NodeJS.ProcessEnv} [_env]
 * @returns {number}
 */
export function whatsappDailyCap(_env = process.env) {
  return parseEnvInt('RESILIENCE_WHATSAPP_MAX_SIGNALS_PER_SENDER', DEFAULT_DAILY_CAP);
}

/**
 * Max signals per sender per signal_type per hour for WhatsApp sources.
 *
 * @param {NodeJS.ProcessEnv} [_env]
 * @returns {number}
 */
export function whatsappHourlyTypeCap(_env = process.env) {
  return parseEnvInt('RESILIENCE_WHATSAPP_HOURLY_TYPE_CAP', DEFAULT_HOURLY_TYPE_CAP);
}

/**
 * Tag signals exceeding per-sender caps (whatsapp / field_whatsapp) with gaming_suspect and rejected tier.
 *
 * @param {Array<object>} signals
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Array<object>} signals with cap violations tagged
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
 * Down-rank critical field_whatsapp-only signals without corroboration from other source families.
 *
 * @param {Array<object>} signals
 * @returns {Array<object>}
 */
export function applyFieldCorroborationGaming(signals) {
  const list = Array.isArray(signals) ? signals : [];
  const hasNonWaField = list.some((s) =>
    ['field', 'visits', 'pbo', 'pbo_regional', 'naftali'].includes(s?.source_type),
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
 * Apply all signal gaming policies in sequence (caps then field corroboration).
 *
 * @param {Array<object>} signals
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Array<object>}
 */
export function applySignalGamingPolicy(signals, env = process.env) {
  let out = applyWhatsappSenderCaps(signals, env);
  out = applyFieldCorroborationGaming(out);
  return out;
}

export {isDmPhoneAllowed} from '../../contracts/gamingPolicy.js';
