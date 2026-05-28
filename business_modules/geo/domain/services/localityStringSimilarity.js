/**
 * Sørensen–Dice coefficient on character bigrams (good enough for short Hebrew/English locality names).
 * @param {string} a normalized
 * @param {string} b normalized
 * @returns {number} in [0, 1]
 */

function characterBigrams(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    m.set(bg, (m.get(bg) ?? 0) + 1);
  }
  return m;
}

export function diceBigramSimilarity(a, b) {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  if (sa.length < 2 || sb.length < 2) {
    if (sa === sb) return 1;
    if (!sa.length || !sb.length) return 0;
    return sa.includes(sb) || sb.includes(sa) ? 0.85 : 0;
  }
  const A = characterBigrams(sa);
  const B = characterBigrams(sb);
  let inter = 0;
  let sumA = 0;
  for (const v of A.values()) sumA += v;
  let sumB = 0;
  for (const v of B.values()) sumB += v;
  for (const [bg, ca] of A) {
    const cb = B.get(bg) ?? 0;
    if (cb > 0) inter += Math.min(ca, cb);
  }
  return inter === 0 ? 0 : (2 * inter) / (sumA + sumB);
}
