/**
 * File-based connectivity probe trust policy (Option D — no live HTTP).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { totalAnchorVolume } from './dataVoid/sourceChannels.js';

const DEFAULT_MIN_CORROBORATION = 2;
const UNCORROBORATED_CONFIDENCE = 0.85;
const CORROBORATED_CONFIDENCE = 1;

function parseEnvInt(name, fallback) {
  const raw = Number.parseInt(process.env[name] ?? String(fallback), 10);
  return Number.isFinite(raw) ? raw : fallback;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function probeSourceAllowlist(env = process.env) {
  const raw = env.RESILIENCE_PROBE_SOURCE_ALLOWLIST;
  if (raw == null || String(raw).trim() === '') return null;
  return new Set(String(raw).split(',').map((s) => s.trim()).filter(Boolean));
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function probeMinCorroboration(_env = process.env) {
  return parseEnvInt('RESILIENCE_PROBE_MIN_CORROBORATION', DEFAULT_MIN_CORROBORATION);
}

/**
 * Verify optional HMAC on probe record payload.
 * @param {object} record
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifyProbeRecordHmac(record, env = process.env) {
  const secret = env.RESILIENCE_PROBE_HMAC_SECRET;
  if (!secret || String(secret).trim() === '') return { ok: true };
  const hmac = record?.hmac;
  if (!hmac || typeof hmac !== 'string') {
    return { ok: false, reason: 'missing_hmac' };
  }
  const payload = { ...record };
  delete payload.hmac;
  const body = JSON.stringify(payload);
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  try {
    const a = Buffer.from(hmac, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'hmac_mismatch' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'hmac_invalid' };
  }
}

/**
 * @param {object} record
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ accepted: boolean, reason?: string }}
 */
export function validateProbeRecord(record, env = process.env) {
  if (!record || typeof record !== 'object') {
    return { accepted: false, reason: 'invalid_record' };
  }
  const allowlist = probeSourceAllowlist(env);
  const source = record.probe_source ?? 'connectivity-probe';
  if (allowlist && !allowlist.has(source)) {
    return { accepted: false, reason: 'source_not_allowlisted' };
  }
  const hmacResult = verifyProbeRecordHmac(record, env);
  if (!hmacResult.ok) {
    return { accepted: false, reason: hmacResult.reason ?? 'hmac_failed' };
  }
  return { accepted: true };
}

/**
 * @param {Array<object>} probeSignals infrastructure_probe signals
 * @param {Array<object>} allSignals full signal list for field corroboration
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   signals: Array<object>,
 *   probe_outage_confirmed: boolean,
 *   probe_outage_unconfirmed: boolean,
 *   probe_corroboration_count: number,
 *   rejected_records: number,
 * }}
 */
export function applyProbeCorroborationPolicy(probeSignals, allSignals = [], env = process.env) {
  const list = Array.isArray(probeSignals) ? probeSignals : [];
  const minCorr = probeMinCorroboration(env);
  const fieldActive = totalAnchorVolume(allSignals) > 0;

  const distinctSources = new Set(
    list.map((s) => s.article_source ?? s.probe_source ?? 'connectivity-probe'),
  );
  const corroborationCount = distinctSources.size;
  const confirmed = corroborationCount >= minCorr
    || (corroborationCount >= 1 && fieldActive);

  const signals = list.map((s) => ({
    ...s,
    probe_corroborated: confirmed,
    extraction_confidence: confirmed ? CORROBORATED_CONFIDENCE : UNCORROBORATED_CONFIDENCE,
  }));

  return {
    signals,
    probe_outage_confirmed: list.length > 0 && confirmed,
    probe_outage_unconfirmed: list.length > 0 && !confirmed,
    probe_corroboration_count: corroborationCount,
    rejected_records: 0,
  };
}

/**
 * Filter and transform raw probe records before signal conversion.
 * @param {Array<object>} records
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ records: Array<object>, rejected: number, reject_reasons: Record<string, number> }}
 */
export function filterValidProbeRecords(records, env = process.env) {
  const rows = Array.isArray(records) ? records : [];
  /** @type {Array<object>} */
  const accepted = [];
  /** @type {Record<string, number>} */
  const reject_reasons = {};
  let rejected = 0;

  for (const row of rows) {
    const v = validateProbeRecord(row, env);
    if (v.accepted) {
      accepted.push(row);
    } else {
      rejected += 1;
      const r = v.reason ?? 'rejected';
      reject_reasons[r] = (reject_reasons[r] ?? 0) + 1;
    }
  }

  return { records: accepted, rejected, reject_reasons };
}

/**
 * Re-apply corroboration flags on probe signals within a merged signal list.
 * @param {Array<object>} signals
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Array<object>}
 */
export function enrichProbeSignalsInList(signals, env = process.env) {
  const list = Array.isArray(signals) ? signals : [];
  const probes = list.filter((s) => s?.source_type === 'infrastructure_probe');
  if (probes.length === 0) return list;

  const policy = applyProbeCorroborationPolicy(probes, list, env);
  const byRef = new Map(probes.map((p, i) => [p, policy.signals[i]]));
  return list.map((s) => (byRef.has(s) ? byRef.get(s) : s));
}
