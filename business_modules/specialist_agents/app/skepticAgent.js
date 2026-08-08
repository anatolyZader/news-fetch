/**
 * Skeptic agent — adversarial, fresh-context claim check after the critic.
 *
 * **Owns:** challenging individual component claims against the evidence their
 * refs resolve to, and returning keep/drop verdicts. One LLM call per claim.
 *
 * **Pipeline position:** after `runCriticChecks` / `applyCriticRepair` inside
 * `assessmentOrchestrator.assessComponent`. Dormant unless `SKEPTIC_SAMPLE_SIZE`
 * is set — see `domain/services/skepticPolicy.js`.
 *
 * **Why this exists:** `criticAgent` is deterministic. It catches structural
 * defects (no refs, unresolvable refs, dominance unacknowledged) but it cannot
 * read a claim and say "the evidence does not carry that." Nothing else in the
 * pipeline does either — the specialist that wrote the claim is its own last
 * reader. This node is the second reader, and it is deliberately not the same
 * agent: `kernel.run` builds fresh working memory per call and takes system +
 * messages explicitly, so the skeptic structurally cannot inherit the
 * specialist's reasoning. It sees the claim and the evidence, never the chat
 * that produced them.
 *
 * **Scope — one lens only.** The article-standard three-lens verify is
 * correct / current / source-real. Two of those are already deterministic here:
 * ref resolution is `signalRefRegistry` + the critic's `missing_evidence_refs`,
 * and recency is the visits 14-day expiry and temporal decay. Paying an LLM to
 * repeat them would buy nothing. This node adds only the lens no rule covers:
 * does the evidence actually carry the claim.
 *
 * **Inputs:** component assessment (post-critic), critic verdict, signal pool.
 *
 * **Outputs:** `{ verdicts, sampled, failures }` — never mutates the assessment.
 *
 * **Does NOT:** retrieve, re-run specialists, touch narratives, or strengthen
 * anything. Verdict application lives in `skepticPolicy.applySkepticVerdicts`.
 *
 * **Collaborators:** `cross-cut-modules/agent` (kernel, skeptic profile),
 * `skepticPolicy`, `resilience_scorer` (`buildRefKey`).
 */
import { createAgentKernel, resolveModelForStage } from '../../../cross-cut-modules/agent/index.js';
import {
  SKEPTIC_TOOLS,
  ASSESSMENT_SKEPTIC_PROFILE,
} from '../../../cross-cut-modules/agent/profiles/assessment.profile.js';
import { buildRefKey } from '../../resilience_scorer/index.js';
import { selectClaimsForSkeptic } from '../domain/services/skepticPolicy.js';

const MAX_EVIDENCE_CHARS = 600;

const SKEPTIC_SYSTEM = [
  'You are an independent reviewer. You did not write the claim below and you have no stake in it.',
  '',
  'You are given ONE claim and the evidence excerpts its citations resolve to. Decide whether that evidence carries that claim.',
  '',
  'Return `drop` when:',
  '- the claim asserts more than the evidence states (a scale, a trend, a cause the evidence does not establish)',
  '- the evidence is about a different subject, place, or period than the claim',
  '- the evidence is a single narrow observation and the claim generalises from it to a population',
  '',
  'Return `keep` when the evidence plainly supports the claim as written, even if the support is narrow.',
  'Narrow support is not a defect — a single municipality report IS a single source. Judge the claim against what it asserts, not against how much evidence you wish existed.',
  '',
  'You cannot strengthen the claim, add evidence, or request more. Your only outputs are keep and drop.',
  'When you genuinely cannot tell, return `keep` — dropping real evidence is worse than keeping a weak claim the confidence label already qualifies.',
  '',
  'Call submit_claim_verdict exactly once.',
].join('\n');

/**
 * Index the signal pool by stable ref key so a claim's `evidence_refs` can be
 * resolved to the text the specialist actually saw.
 *
 * @param {object[]} signals
 * @returns {Map<string, object>}
 */
function indexSignalsByRef(signals) {
  const byRef = new Map();
  for (const signal of signals ?? []) {
    if (!signal) continue;
    try {
      const key = buildRefKey(signal);
      if (!byRef.has(key)) byRef.set(key, signal);
    } catch {
      // A signal that cannot produce a ref key cannot be cited; skip it.
    }
  }
  return byRef;
}

function formatEvidence(signal) {
  const parts = [
    `type: ${signal.signal_type ?? 'unknown'}`,
    `evidence_type: ${signal.evidence_type ?? 'unknown'}`,
    signal.scope_level ? `scope: ${signal.scope_level}` : null,
    signal.article_source ? `source: ${signal.article_source}` : null,
    `text: ${String(signal.evidence ?? signal.text ?? '').slice(0, MAX_EVIDENCE_CHARS)}`,
  ].filter(Boolean);
  return parts.join('\n  ');
}

/**
 * Build the user message for one claim. Contains the claim and its evidence and
 * nothing else — no component narrative, no sibling claims, no specialist trace.
 */
function buildClaimPrompt(claim, byRef) {
  const refs = Array.isArray(claim.evidence_refs) ? claim.evidence_refs : [];
  const blocks = [];
  const unresolved = [];
  for (const ref of refs) {
    const signal = byRef.get(ref);
    if (signal) blocks.push(`[${ref}]\n  ${formatEvidence(signal)}`);
    else unresolved.push(ref);
  }
  const lines = [`CLAIM: ${claim.text}`, '', 'EVIDENCE:'];
  lines.push(blocks.length ? blocks.join('\n\n') : '(none of the cited refs resolved)');
  if (unresolved.length) {
    // Stated, not judged: unresolved refs are the critic's finding. Naming them
    // stops the skeptic silently treating a tooling gap as an overstated claim.
    lines.push('', `NOTE: ${unresolved.length} cited ref(s) could not be resolved and are not shown. Judge only on the evidence above; do not drop the claim for the missing ones.`);
  }
  return lines.join('\n');
}

/**
 * Challenge one claim. Fail-open: any error returns a `keep`, flagged.
 */
async function challengeClaim({ claim, index, byRef, kernel, model, budget, onUsage, traceId, componentId }) {
  try {
    const result = await kernel.run({
      profile: ASSESSMENT_SKEPTIC_PROFILE,
      agentKind: `skeptic:${componentId}`,
      model,
      maxRounds: 1,
      maxTokens: 400,
      system: SKEPTIC_SYSTEM,
      messages: [{ role: 'user', content: buildClaimPrompt(claim, byRef) }],
      tools: SKEPTIC_TOOLS,
      forceSubmitTool: 'submit_claim_verdict',
      budget,
      traceId: `${traceId}:skeptic:${componentId}:${index}`,
      onUsage,
    });
    const submitted = result.submitPayloads.find((p) => p.tool === 'submit_claim_verdict');
    if (!submitted?.payload) {
      return { index, claim_id: claim.claim_id, verdict: 'keep', reason_code: 'no_verdict', failed: true };
    }
    const { verdict, reason_code, rationale } = submitted.payload;
    return {
      index,
      claim_id: claim.claim_id,
      verdict: verdict === 'drop' ? 'drop' : 'keep',
      reason_code,
      rationale,
      failed: false,
    };
  } catch (err) {
    return {
      index,
      claim_id: claim.claim_id,
      verdict: 'keep',
      reason_code: 'skeptic_error',
      rationale: err.message,
      failed: true,
    };
  }
}

/**
 * Run the adversarial skeptic over a sample of a component's claims.
 *
 * Claims are independent, so they are challenged in parallel — the node costs
 * one round-trip of wall clock regardless of sample size.
 *
 * @param {object} params
 * @param {object} params.assessment — post-critic component assessment (not mutated)
 * @param {object} [params.criticVerdict]
 * @param {object[]} [params.signals] — signal pool for ref resolution
 * @param {object} [params.llmPort]
 * @param {object} [params.agentKernel]
 * @param {object} [params.budget]
 * @param {Function} [params.onUsage]
 * @param {string} [params.traceId]
 * @param {number} [params.sampleSize]
 * @returns {Promise<{ verdicts: object[], sampled: number, failures: number }>}
 * @sideEffects one LLM call per sampled claim; no writes
 */
export async function runSkepticChecks({
  assessment,
  criticVerdict,
  signals,
  llmPort,
  agentKernel,
  budget,
  onUsage,
  traceId = 'skeptic',
  sampleSize,
}) {
  const selected = selectClaimsForSkeptic({ assessment, criticVerdict, sampleSize });
  if (selected.length === 0) return { verdicts: [], sampled: 0, failures: 0 };

  const kernel = agentKernel ?? createAgentKernel({ llmPort });
  const model = resolveModelForStage('critic');
  const byRef = indexSignalsByRef(signals);
  const componentId = assessment.component_id ?? 'unknown';

  const verdicts = await Promise.all(
    selected.map(({ claim, index }) =>
      challengeClaim({ claim, index, byRef, kernel, model, budget, onUsage, traceId, componentId })),
  );

  // A skeptic that died must not read as a skeptic that approved. Count the
  // failures so the caller can record what was not actually checked.
  const failures = verdicts.filter((v) => v.failed).length;
  return { verdicts, sampled: selected.length, failures };
}
