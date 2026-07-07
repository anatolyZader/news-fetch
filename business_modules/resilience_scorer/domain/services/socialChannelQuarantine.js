/**
 * OSINT channel quarantine — detect high polarization on social + telegram.
 * Auto-exclusion from scoring when suggested (default); analyst dismiss suppresses.
 */

import { getSignalCatalogEntry } from './signalCatalog.js';

const DEFAULT_MIN_SIGNALS = 4;
const MIN_SHARE = 0.25;
const POLARIZATION_THRESHOLD = 0.85;

/** OSINT channels subject to polarization quarantine (not whatsapp — curated north). */
export const OSINT_SOURCE_TYPES = new Set(['social', 'telegram']);

export const SOCIAL_QUARANTINE_ARTICLE_KEY = '__epistemic__:social_channel_quarantine';

export const QUARANTINE_REASON_OSINT = 'osint_polarization';

export function isSocialQuarantineEnabled(env = process.env) {
  return env.RESILIENCE_SOCIAL_QUARANTINE !== '0';
}

/** Default on: auto-exclude OSINT from metrics when polarization triggers. */
export function isOsintQuarantineAutoEnabled(env = process.env) {
  return env.RESILIENCE_OSINT_QUARANTINE_AUTO !== '0';
}

function minOsintSignals(env = process.env) {
  const n = Number.parseInt(env.RESILIENCE_SOCIAL_QUARANTINE_MIN_SIGNALS ?? String(DEFAULT_MIN_SIGNALS), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MIN_SIGNALS;
}

/**
 * @param {object} signal
 * @returns {'+'|'-'|null}
 */
function polarityForSignal(signal) {
  const type = signal?.signal_type ?? signal?.type;
  if (!type) return null;
  const entry = getSignalCatalogEntry(type);
  const pol = signal.polarity ?? entry?.defaultPolarity;
  if (pol === 'positive' || pol === '+') return '+';
  if (pol === 'negative' || pol === '-') return '-';
  return entry?.defaultPolarity === 'positive' ? '+' : '-';
}

/**
 * @param {Array<object>} osintSignals
 */
function osintPolarization(osintSignals) {
  let pos = 0;
  let neg = 0;
  for (const s of osintSignals) {
    const pol = polarityForSignal(s);
    const w = Math.abs(Number(s._contribution ?? s.extraction_confidence ?? 0.85));
    const mass = w > 0 ? w : (s.extraction_confidence ?? 0.85);
    if (pol === '+') pos += mass;
    else neg += mass;
  }
  const total = pos + neg;
  if (total <= 0) return 0;
  const minSide = Math.min(pos, neg);
  const maxSide = Math.max(pos, neg);
  if (maxSide <= 0) return 0;
  return minSide / maxSide;
}

/**
 * @param {object} signal
 */
export function isOsintSourceType(signal) {
  return OSINT_SOURCE_TYPES.has(signal?.source_type);
}

/**
 * @param {Array<object>} signals — scoped metrics-eligible or all scoped
 * @returns {{
 *   suggested: boolean,
 *   active: boolean,
 *   auto_excluded: boolean,
 *   reason: string | null,
 *   osint_signal_count: number,
 *   social_signal_count: number,
 *   telegram_signal_count: number,
 *   osint_polarization: number,
 *   osint_share: number,
 *   social_polarization: number,
 *   social_share: number,
 * }}
 */
export function evaluateOsintChannelQuarantine(signals, opts = {}) {
  const empty = {
    suggested: false,
    active: opts.active === true,
    auto_excluded: false,
    reason: null,
    osint_signal_count: 0,
    social_signal_count: 0,
    telegram_signal_count: 0,
    osint_polarization: 0,
    osint_share: 0,
    social_polarization: 0,
    social_share: 0,
  };

  if (!isSocialQuarantineEnabled(opts.env)) {
    return opts.active ? { ...empty, active: true, reason: 'analyst_confirmed' } : empty;
  }

  const list = Array.isArray(signals) ? signals : [];
  const osint = list.filter((s) => isOsintSourceType(s));
  const social = osint.filter((s) => s?.source_type === 'social');
  const telegram = osint.filter((s) => s?.source_type === 'telegram');
  const osintCount = osint.length;
  const share = list.length > 0 ? osintCount / list.length : 0;
  const pol = osintPolarization(osint);
  const socialShare = list.length > 0 ? social.length / list.length : 0;
  const socialPol = osintPolarization(social);

  const suggested = osintCount >= minOsintSignals(opts.env)
    && share >= MIN_SHARE
    && pol >= POLARIZATION_THRESHOLD;

  const dismissed = opts.dismissed === true;
  const autoOn = isOsintQuarantineAutoEnabled(opts.env);
  const autoExcluded = suggested && autoOn && !dismissed;
  const active = opts.active === true || autoExcluded;

  let reason = null;
  if (autoExcluded) reason = QUARANTINE_REASON_OSINT;
  else if (suggested) reason = 'high_osint_polarization';
  else if (opts.active) reason = 'analyst_confirmed';

  return {
    suggested,
    active,
    auto_excluded: autoExcluded,
    reason,
    osint_signal_count: osintCount,
    social_signal_count: social.length,
    telegram_signal_count: telegram.length,
    osint_polarization: Math.round(pol * 1000) / 1000,
    osint_share: Math.round(share * 1000) / 1000,
    social_polarization: Math.round(socialPol * 1000) / 1000,
    social_share: Math.round(socialShare * 1000) / 1000,
  };
}

/** @deprecated use evaluateOsintChannelQuarantine */
export function evaluateSocialChannelQuarantine(signals, opts = {}) {
  const r = evaluateOsintChannelQuarantine(signals, opts);
  return {
    suggested: r.suggested,
    active: r.active,
    reason: r.reason,
    social_signal_count: r.osint_signal_count,
    social_polarization: r.osint_polarization,
    social_share: r.osint_share,
  };
}

/**
 * Filter OSINT sources from scoring list when quarantine is active.
 * @param {Array<object>} signals
 * @param {ReturnType<typeof evaluateOsintChannelQuarantine>} quarantine
 */
export function applyOsintQuarantineFilter(signals, quarantine) {
  if (!quarantine?.active) return signals ?? [];
  return (signals ?? []).filter((s) => !isOsintSourceType(s));
}
