import { signalDedupKey } from './signalVerification.js';

/**
 * Merge two extraction passes (E3 optional dual extract).
 * Dedupes by `signalDedupKey`; when the same key appears in both passes,
 * bumps extraction_confidence slightly as a stub for "agreement".
 *
 * @param {object[]} primary
 * @param {object[]} secondary
 * @returns {object[]}
 */
export function mergeDualExtractionSignals(primary, secondary) {
  const a = Array.isArray(primary) ? primary : [];
  const b = Array.isArray(secondary) ? secondary : [];
  const byKey = new Map();
  for (const s of a) {
    const k = signalDedupKey(s);
    byKey.set(k, { ...s, _dual_pass_agreement: false });
  }
  for (const s of b) {
    const k = signalDedupKey(s);
    if (!byKey.has(k)) {
      byKey.set(k, { ...s, _dual_pass_agreement: false });
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
  return [...byKey.values()];
}
