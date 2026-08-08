/**
 * Critic agent — deterministic post-specialist validation and auto-repair.
 *
 * **Owns:** rule-based checks on component assessments (claims, epistemic consistency,
 * tool usage, gap closure, OOV narrative) plus text grounding score; repair handlers.
 *
 * **Pipeline position:** immediately after each `runComponentSpecialist` in orchestrator.
 *
 * **Inputs:** component assessment object, full epistemic profile.
 *
 * **Outputs:** `{ passed, issues, requiresRepair, grounding_score }`; optional mutating repair.
 *
 * **Does NOT:** call LLMs (contested LLM pass lives elsewhere); re-run specialists.
 *
 * **Collaborators:** `scoreTextGrounding` (resilience_scorer), `synthesisOovChecks`.
 */
import { scoreTextGrounding } from '../../resilience_scorer/index.js';
import { checkComponentOovInNarrative, repairComponentOovInNarrative } from '../domain/services/synthesisOovChecks.js';

function claimHasOovFlag(claim) {
  const flags = claim.epistemic_flags ?? claim.flags ?? [];
  return flags.includes('oov_cluster') || flags.includes('unverified');
}

function gapWasAttempted(gapText, retrievalGaps) {
  const base = String(gapText ?? '').trim();
  return (retrievalGaps ?? []).some((g) =>
    String(g).startsWith('attempted:') && String(g).includes(base.slice(0, 40)));
}

function collectClaimIssues(assessment, issues) {
  for (const [i, claim] of (assessment.claims ?? []).entries()) {
    if (!claim.text) issues.push({ type: 'missing_claim_text', index: i });
    if (!Array.isArray(claim.evidence_refs) || claim.evidence_refs.length === 0) {
      issues.push({ type: 'missing_evidence_refs', index: i, claim_id: claim.claim_id });
    }
    if (claimHasOovFlag(claim) && assessment.severity === 'critical') {
      issues.push({ type: 'oov_critical_severity', index: i });
    }
  }
}

function collectEpistemicIssues(assessment, ep, issues) {
  if (ep.thin_evidence && assessment.severity !== 'abstain' && assessment.confidence === 'high') {
    issues.push({ type: 'thin_evidence_strong_claim', severity: assessment.severity });
  }
  if (ep.contested && !assessment.dissent_summary) {
    issues.push({ type: 'contested_without_dissent' });
  }
  const narrative = String(assessment.narrative ?? '').toLowerCase();
  const gapsText = (assessment.retrieval_gaps ?? []).join(' ').toLowerCase();
  for (const w of ep.dominance_warnings ?? []) {
    const dominanceAcknowledged = narrative.includes('source') || gapsText.includes('single source channel');
    if (w.layer === 'source_type' && !dominanceAcknowledged && assessment.severity !== 'abstain') {
      issues.push({ type: 'dominance_unacknowledged', warning: w.message });
    }
  }
}

function collectToolUsageIssues(assessment, issues) {
  const toolUsage = assessment.tool_usage ?? {};
  if (
    assessment.severity !== 'abstain'
    && assessment.confidence === 'high'
    && (toolUsage.lookup ?? 0) > 0
    && (toolUsage.multiHop ?? 0) === 0
  ) {
    issues.push({ type: 'lookup_only_no_retrieval' });
  }
}

function collectGapClosureIssues(assessment, issues) {
  for (const task of assessment.gap_closure_tasks ?? []) {
    if (task.gap_type !== 'investigation') continue;
    if (!gapWasAttempted(task.action, assessment.retrieval_gaps)) {
      issues.push({ type: 'gap_unaddressed', gap_id: task.gap_id, action: task.action });
    }
  }
}

/**
 * Run deterministic critic checks on a component assessment.
 *
 * @param {object} assessment — component assessment (may mutate `grounding_score`)
 * @param {object} epistemicProfile
 * @returns {{ passed: boolean, issues: object[], requiresRepair: boolean, grounding_score: number }}
 */
export function runCriticChecks(assessment, epistemicProfile) {
  const issues = [];
  const ep = epistemicProfile?.by_component?.[assessment.component_id] ?? {};

  collectClaimIssues(assessment, issues);
  collectEpistemicIssues(assessment, ep, issues);
  collectToolUsageIssues(assessment, issues);
  collectGapClosureIssues(assessment, issues);
  const oovNarr = checkComponentOovInNarrative(assessment);
  for (const i of oovNarr.issues) issues.push(i);

  const evidenceTexts = (assessment.claims ?? []).map((c) => c.text);
  const { score, issues: groundingIssues } = scoreTextGrounding(assessment.narrative ?? '', evidenceTexts);
  assessment.grounding_score = score;
  for (const gi of groundingIssues) issues.push({ type: 'grounding', ...gi });

  const passed = issues.filter((i) => i.type !== 'grounding').length === 0 && score >= 0.5;
  return {
    passed,
    issues,
    requiresRepair: !passed && issues.some((i) => REPAIR_ISSUE_TYPES.has(i.type)),
    grounding_score: score,
  };
}

const CRITIC_REPAIR_HANDLERS = {
  thin_evidence_strong_claim(assessment, issue, repairLog) {
    assessment.severity = 'abstain';
    assessment.confidence = 'low';
    assessment.user_status = 'insufficient_data';
    repairLog.push({ issue: issue.type, action: 'downgraded_to_abstain' });
  },
  lookup_only_no_retrieval(assessment, issue, repairLog) {
    assessment.confidence = 'medium';
    repairLog.push({ issue: issue.type, action: 'downgraded_confidence' });
  },
  oov_critical_severity(assessment, issue, repairLog) {
    assessment.severity = 'moderate';
    assessment.user_status = 'watch';
    repairLog.push({ issue: issue.type, action: 'downgraded_oov_severity' });
  },
  contested_without_dissent(assessment, issue, repairLog) {
    assessment.dissent_summary = assessment.dissent_summary
      || 'Evidence shows mixed supporting and weakening signals across sources.';
    repairLog.push({ issue: issue.type, action: 'added_dissent_summary' });
  },
  missing_evidence_refs(assessment, issue, repairLog) {
    const claim = assessment.claims?.[issue.index];
    if (!claim || claim.evidence_refs?.length) return;
    // A claim with no evidence is dropped, never given a manufactured citation.
    // This used to assign `synthetic:<component>:<index>`, which satisfied the
    // check while leaving a citation that resolves to nothing anywhere — the
    // exact defect the ref-namespace work exists to eliminate.
    //
    // Marked rather than spliced: issues carry positional indices and are
    // applied in a loop, so removing one here would shift every later index.
    // `sweepUnsupportedClaims` removes them in one pass afterwards.
    claim.unsupported_drop = true;
    repairLog.push({
      issue: issue.type,
      action: 'dropped_unsupported_claim',
      index: issue.index,
      claim_text: String(claim.text ?? '').slice(0, 160),
    });
  },
  dominance_unacknowledged(assessment, issue, repairLog) {
    const note = 'Evidence relies on a single source channel; treat component reads as provisional.';
    const existing = assessment.retrieval_gaps ?? [];
    if (!existing.includes(note)) {
      assessment.retrieval_gaps = [...existing, note];
    }
    repairLog.push({ issue: issue.type, action: 'noted_dominance_gap' });
  },
  gap_unaddressed(assessment, issue, repairLog) {
    const note = `Gap not fully resolved: ${issue.action}`;
    // Keep the note in retrieval_gaps metadata only — never mutate the user
    // narrative / evidence tree. Dedup so repeated repair rounds (or several
    // components sharing one systemic gap) don't stack identical notes.
    const existing = assessment.retrieval_gaps ?? [];
    if (!existing.includes(note)) {
      assessment.retrieval_gaps = [...existing, note];
    }
    repairLog.push({ issue: issue.type, action: 'noted_open_gap', gap_id: issue.gap_id });
  },
  oov_unaddressed_in_narrative(assessment, issue, repairLog) {
    const repaired = repairComponentOovInNarrative(assessment, [issue]);
    assessment.narrative = repaired.narrative;
    repairLog.push({ issue: issue.type, action: 'appended_oov_note', claim_id: issue.claim_id });
  },
};

// Derived from the handler table so a repairable issue type can never be
// silently missing from the repair gate.
const REPAIR_ISSUE_TYPES = new Set(Object.keys(CRITIC_REPAIR_HANDLERS));

/**
 * Apply registered repair handlers for repairable critic issues.
 *
 * @param {object} assessment — mutates in place; appends `repair_log`
 * @param {object[]} issues
 * @returns {object} same assessment reference
 */
/**
 * Remove claims marked unsupported by repair, in one pass once every
 * positional issue index has been consumed.
 *
 * @param {object} assessment
 */
function sweepUnsupportedClaims(assessment) {
  if (!Array.isArray(assessment.claims)) return;
  const kept = assessment.claims.filter((c) => c?.unsupported_drop !== true);
  if (kept.length === assessment.claims.length) return;
  assessment.claims = kept;
  // evidence_tree is the claim list on the specialist path; keep them in step.
  if (Array.isArray(assessment.evidence_tree)) {
    assessment.evidence_tree = assessment.evidence_tree.filter((c) => c?.unsupported_drop !== true);
  }
}

export function applyCriticRepair(assessment, issues) {
  const repair_log = [...(assessment.repair_log ?? [])];
  for (const issue of issues) {
    CRITIC_REPAIR_HANDLERS[issue.type]?.(assessment, issue, repair_log);
  }
  sweepUnsupportedClaims(assessment);
  assessment.repair_log = repair_log;
  return assessment;
}
