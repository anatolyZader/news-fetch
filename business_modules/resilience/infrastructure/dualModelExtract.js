import { signalDedupKey } from './signalVerification.js';

/**
 * When second extract is enabled, require both passes to agree (intersection-only).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isDualRequireAgreementEnabled(env = process.env) {
  return env.RESILIENCE_DUAL_REQUIRE_AGREEMENT !== '0';
}

/**
 * Merge two extraction passes (E3 optional dual extract).
 * Dedupes by `signalDedupKey`; when the same key appears in both passes,
 * bumps extraction_confidence slightly as a stub for "agreement".
 *
 * @param {object[]} primary
 * @param {object[]} secondary
 * @param {{ requireAgreement?: boolean }} [opts]
 * @returns {{ signals: object[], dual_veto_dropped: number }}
 */
export function mergeDualExtractionSignals(primary, secondary, opts = {}) {
  const a = Array.isArray(primary) ? primary : [];
  const b = Array.isArray(secondary) ? secondary : [];
  const requireAgreement = opts.requireAgreement === true;
  const byKey = new Map();
  for (const s of a) {
    const k = signalDedupKey(s);
    byKey.set(k, { ...s, _dual_pass_agreement: false });
  }
  for (const s of b) {
    const k = signalDedupKey(s);
    if (!byKey.has(k)) {
      if (!requireAgreement) {
        byKey.set(k, { ...s, _dual_pass_agreement: false });
      }
      continue;
    }
    const prev = byKey.get(k);
    const ec = Math.min(1, (prev.extraction_confidence ?? 0.85) + 0.05);
    byKey.set(k, {
      ...prev,
      extraction_confidence: ec,
      _dual_pass_agreement: true,
    });
  }
  let signals = [...byKey.values()];
  let dual_veto_dropped = 0;
  if (requireAgreement) {
    const before = signals.length;
    signals = signals.filter((s) => s._dual_pass_agreement === true);
    dual_veto_dropped = before - signals.length;
  }
  return { signals, dual_veto_dropped };
}
