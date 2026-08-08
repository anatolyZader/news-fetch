/**
 * Skeptic policy — pure selection and verdict-application rules for the
 * adversarial claim check that runs after the deterministic critic.
 *
 * **Owns:** the gate (is the skeptic armed), which claims are worth spending a
 * skeptic call on, and the one-directional rules for applying its verdicts.
 *
 * **Pipeline position:** consulted by `app/skepticAgent.js`; no I/O, no LLM.
 *
 * **Design constraint — the skeptic may only subtract.** It can drop a claim or
 * downgrade a component. It can never add a claim, raise confidence, escalate
 * severity, or touch the narrative. A checker that can strengthen its subject is
 * an optimizer, and an optimizer will learn to approve. Keeping the verdict
 * one-directional is what makes an adversarial node safe to automate.
 *
 * **Does NOT:** call LLMs, resolve refs, read files.
 *
 * **Collaborators:** `app/skepticAgent.js`, `app/criticAgent.js` (runs first).
 */

/**
 * Claims-per-component budget for the skeptic. `0` (the default) disables the
 * stage entirely, so the assessment path is byte-identical to the pre-skeptic
 * pipeline until the user opts in.
 *
 * @returns {number} non-negative integer sample size
 */
export function skepticSampleSize() {
  const raw = process.env.SKEPTIC_SAMPLE_SIZE;
  if (raw === undefined || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** @returns {boolean} whether the adversarial skeptic stage runs at all. */
export function skepticEnabled() {
  return skepticSampleSize() > 0;
}

/**
 * Sample size for one selection call.
 *
 * There is deliberately no default fallback: an unset env var means zero, not
 * "some". A caller that forgets to pass a size gets no skeptic calls rather
 * than silently arming a stage the user never enabled. Only an explicit
 * argument (tests, a one-off tool) overrides the env gate.
 *
 * @param {number} [explicit]
 * @returns {number}
 */
export function resolveSampleSize(explicit) {
  if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
  return skepticSampleSize();
}

/**
 * Rank key for a claim — lower sorts first (more worth checking).
 *
 * The deterministic critic already catches claims with no refs, unresolvable
 * refs, and refs of a type the report never produced. Those need no LLM. What
 * survives the critic untouched is exactly what nothing has challenged: a claim
 * with real refs that may still say more than those refs carry. Thin support
 * first, then stable order so two runs over the same assessment pick the same
 * claims.
 */
function claimRiskKey(claim, index) {
  const refCount = Array.isArray(claim.evidence_refs) ? claim.evidence_refs.length : 0;
  const textLength = String(claim.text ?? '').length;
  // Fewest refs first; among equals, the longest claim (most asserted per ref).
  return [refCount, -textLength, index];
}

function compareRiskKeys(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Pick the claims worth spending a skeptic call on.
 *
 * Skips assessments where a verdict would change nothing (abstaining components,
 * low-confidence reads) and claims the critic already condemned.
 *
 * @param {object} params
 * @param {object} params.assessment — component assessment, post-critic
 * @param {{ passed?: boolean }} [params.criticVerdict]
 * @param {number} [params.sampleSize]
 * @returns {Array<{ claim: object, index: number }>} claims to challenge, ranked
 */
export function selectClaimsForSkeptic({ assessment, criticVerdict, sampleSize }) {
  const limit = resolveSampleSize(sampleSize);
  if (limit === 0) return [];
  if (!assessment || assessment.severity === 'abstain') return [];
  // A low-confidence read already tells the reader not to lean on it; dropping
  // one of its claims does not change what anyone does with the report.
  if (assessment.confidence === 'low') return [];

  const claims = Array.isArray(assessment.claims) ? assessment.claims : [];
  const candidates = [];
  for (const [index, claim] of claims.entries()) {
    if (!claim || claim.unsupported_drop === true) continue;
    if (!claim.text) continue;
    const refs = Array.isArray(claim.evidence_refs) ? claim.evidence_refs : [];
    // No refs is the critic's job (`missing_evidence_refs`), not the skeptic's.
    if (refs.length === 0) continue;
    candidates.push({ claim, index, key: claimRiskKey(claim, index) });
  }

  candidates.sort((a, b) => compareRiskKeys(a.key, b.key));
  const selected = candidates.slice(0, limit).map(({ claim, index }) => ({ claim, index }));
  // A component the critic already failed is under review anyway — check it, but
  // do not spend the full sample re-condemning it.
  if (criticVerdict?.passed === false) return selected.slice(0, Math.max(1, Math.floor(limit / 2)));
  return selected;
}

/**
 * Apply skeptic verdicts to a component assessment. Subtractive only.
 *
 * Dropped claims are marked rather than spliced, mirroring the critic's repair
 * contract: positional indices stay valid until one sweep removes them.
 *
 * @param {object} assessment — mutates a shallow copy's claim list in place
 * @param {Array<{ index: number, claim_id?: string, verdict: string, reason_code?: string, rationale?: string }>} verdicts
 * @returns {{ assessment: object, dropped: number, checked: number }}
 */
export function applySkepticVerdicts(assessment, verdicts) {
  const repairLog = [...(assessment.repair_log ?? [])];
  const claims = Array.isArray(assessment.claims) ? [...assessment.claims] : [];
  let dropped = 0;
  let checked = 0;

  for (const v of verdicts ?? []) {
    if (!v) continue;
    checked += 1;
    // Anything that is not an explicit `drop` keeps the claim. A skeptic that
    // errored, timed out, or returned nothing must never delete evidence.
    if (v.verdict !== 'drop') continue;
    const claim = claims[v.index];
    if (!claim || claim.unsupported_drop === true) continue;
    claims[v.index] = { ...claim, unsupported_drop: true };
    dropped += 1;
    repairLog.push({
      issue: 'skeptic_rejected',
      action: 'dropped_claim',
      index: v.index,
      claim_id: claim.claim_id,
      reason_code: v.reason_code ?? 'unspecified',
      rationale: String(v.rationale ?? '').slice(0, 240),
      claim_text: String(claim.text ?? '').slice(0, 160),
    });
  }

  if (dropped === 0) {
    return { assessment: { ...assessment, skeptic_checked: checked, skeptic_dropped: 0 }, dropped, checked };
  }

  const kept = claims.filter((c) => c?.unsupported_drop !== true);
  const next = { ...assessment, claims: kept };
  if (Array.isArray(assessment.evidence_tree)) {
    const droppedIds = new Set(
      claims.filter((c) => c?.unsupported_drop === true).map((c) => c.claim_id).filter(Boolean),
    );
    next.evidence_tree = assessment.evidence_tree.filter(
      (c) => !(c?.claim_id && droppedIds.has(c.claim_id)),
    );
  }

  if (kept.length === 0) {
    // Every claim died. The narrative now describes nothing the report can cite,
    // so the component abstains rather than asserting on an empty evidence tree.
    next.severity = 'abstain';
    next.confidence = 'low';
    next.user_status = 'insufficient_data';
    repairLog.push({ issue: 'skeptic_rejected_all', action: 'downgraded_to_abstain' });
  } else if (next.confidence === 'high') {
    next.confidence = 'medium';
    repairLog.push({ issue: 'skeptic_rejected', action: 'downgraded_confidence' });
  }

  next.repair_log = repairLog;
  next.skeptic_checked = checked;
  next.skeptic_dropped = dropped;
  return { assessment: next, dropped, checked };
}
