/**
 * Certainty-weighted overall headline score (analyst).
 */
export function overallScore(componentScores) {
  const scored = Object.values(componentScores).filter((c) => c.score !== null && c.certainty > 0);
  if (scored.length === 0) return null;
  const totalCertainty = scored.reduce((s, c) => s + c.certainty, 0);
  return Math.round(scored.reduce((s, c) => s + c.score * c.certainty, 0) / totalCertainty);
}
