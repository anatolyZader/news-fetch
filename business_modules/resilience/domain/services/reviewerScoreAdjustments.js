/**
 * v2 reviewer override: adjust displayed component scores from persisted
 * `challenge_score` overrides (blend or replace). Does not re-run deterministic
 * scoring — only post-processes headline integers for reporting / UI.
 *
 * A9 — multi-reviewer aggregation: when more than one reviewer has challenged
 * the same component, we aggregate their proposed scores by MEDIAN (rather than
 * "latest wins") so a single late submission cannot overwrite a panel of prior
 * judgements. For an even number of valid challenges we round the median to the
 * nearest integer (banker-friendly rounding via Math.round). Invalid proposed
 * scores (out of range / non-integer) are skipped, not used as zeros.
 *
 * @param {Record<string, object>} scoredComponents  output of scoreComponents()
 * @param {Array<object>} overridesList             from overridesService.list()
 * @param {object} [opts]
 * @param {'blend'|'replace'} [opts.mode]           default from env RESILIENCE_OVERRIDE_SCORE_MODE or 'blend'
 * @param {number} [opts.alpha]                     blend weight on *model* score; (1-alpha) on proposed; default 0.85
 * @returns {Record<string, object>} shallow-cloned map with adjusted `.score`, plus `score_deterministic` preserved
 */
export function applyReviewerScoreAdjustmentsToScoredMap(scoredComponents, overridesList, opts = {}) {
  const out = {};
  for (const [id, c] of Object.entries(scoredComponents)) {
    out[id] = { ...c, score_deterministic: c.score ?? null };
  }

  const mode = opts.mode
    ?? (process.env.RESILIENCE_OVERRIDE_SCORE_MODE === 'replace' ? 'replace' : 'blend');
  const alpha = Number.isFinite(opts.alpha)
    ? opts.alpha
    : Math.min(1, Math.max(0, Number.parseFloat(process.env.RESILIENCE_OVERRIDE_BLEND_ALPHA ?? '0.85')));

  const proposalsByComponent = {};
  for (const o of overridesList ?? []) {
    if (o.kind !== 'challenge_score' || !o.component_id) continue;
    const proposed = o?.proposed?.score;
    if (typeof proposed !== 'number' || !Number.isInteger(proposed) || proposed < 1 || proposed > 10) continue;
    if (!proposalsByComponent[o.component_id]) proposalsByComponent[o.component_id] = [];
    proposalsByComponent[o.component_id].push(proposed);
  }

  for (const [cid, proposals] of Object.entries(proposalsByComponent)) {
    const row = out[cid];
    if (!row || row.score == null || proposals.length === 0) continue;

    const sorted = [...proposals].sort((a, b) => a - b);
    const mid = sorted.length / 2;
    const median = sorted.length % 2 === 1
      ? sorted[Math.floor(mid)]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2);

    const det = row.score_deterministic ?? row.score;
    let next;
    if (mode === 'replace') {
      next = median;
    } else {
      next = Math.round(alpha * det + (1 - alpha) * median);
      next = Math.max(1, Math.min(10, next));
    }
    row.score = next;
    row.reviewer_score_adjusted = next !== det;
    row.reviewer_proposal_count = proposals.length;
    row.reviewer_proposal_median = median;
  }

  return out;
}
