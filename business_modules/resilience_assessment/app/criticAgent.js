/**
 * Critic agent — deterministic checks + optional LLM contested pass.
 */
import { scoreTextGrounding } from '../../resilience/domain/services/narrativeGrounding/sentenceGroundingChecker.js';

function claimHasOovFlag(claim) {
  const flags = claim.epistemic_flags ?? claim.flags ?? [];
  return flags.includes('oov_cluster') || flags.includes('unverified');
}

function gapWasAttempted(gapText, retrievalGaps) {
  const base = String(gapText ?? '').trim();
  return (retrievalGaps ?? []).some((g) =>
    String(g).startsWith('attempted:') && String(g).includes(base.slice(0, 40)));
}

/**
 * @param {object} assessment — component assessment
 * @param {object} epistemicProfile
 * @returns {{ passed: boolean, issues: object[], requiresRepair: boolean }}
 */
export function runCriticChecks(assessment, epistemicProfile) {
  const issues = [];
  const compId = assessment.component_id;
  const ep = epistemicProfile?.by_component?.[compId] ?? {};

  for (const [i, claim] of (assessment.claims ?? []).entries()) {
    if (!claim.text) {
      issues.push({ type: 'missing_claim_text', index: i });
    }
    if (!Array.isArray(claim.evidence_refs) || claim.evidence_refs.length === 0) {
      issues.push({ type: 'missing_evidence_refs', index: i, claim_id: claim.claim_id });
    }
    if (claimHasOovFlag(claim) && assessment.severity === 'critical') {
      issues.push({ type: 'oov_critical_severity', index: i });
    }
  }

  if (ep.thin_evidence && assessment.severity !== 'abstain' && assessment.confidence === 'high') {
    issues.push({ type: 'thin_evidence_strong_claim', severity: assessment.severity });
  }

  if (ep.contested && !assessment.dissent_summary) {
    issues.push({ type: 'contested_without_dissent' });
  }

  for (const w of ep.dominance_warnings ?? []) {
    const narrative = String(assessment.narrative ?? '').toLowerCase();
    if (w.layer === 'source_type' && !narrative.includes('source') && assessment.severity !== 'abstain') {
      issues.push({ type: 'dominance_unacknowledged', warning: w.message });
    }
  }

  const toolUsage = assessment.tool_usage ?? {};
  if (
    assessment.severity !== 'abstain'
    && assessment.confidence === 'high'
    && (toolUsage.lookup ?? 0) > 0
    && (toolUsage.multiHop ?? 0) === 0
  ) {
    issues.push({ type: 'lookup_only_no_retrieval' });
  }

  for (const task of assessment.gap_closure_tasks ?? []) {
    if (task.gap_type !== 'investigation') continue;
    if (!gapWasAttempted(task.action, assessment.retrieval_gaps)) {
      issues.push({
        type: 'gap_unaddressed',
        gap_id: task.gap_id,
        action: task.action,
      });
    }
  }

  const evidenceTexts = (assessment.claims ?? []).map((c) => c.text);
  const { score, issues: groundingIssues } = scoreTextGrounding(
    assessment.narrative ?? '',
    evidenceTexts,
  );
  assessment.grounding_score = score;
  for (const gi of groundingIssues) {
    issues.push({ type: 'grounding', ...gi });
  }

  const passed = issues.filter((i) => i.type !== 'grounding').length === 0 && score >= 0.5;
  return {
    passed,
    issues,
    requiresRepair: !passed && issues.some((i) =>
      [
        'missing_evidence_refs',
        'thin_evidence_strong_claim',
        'contested_without_dissent',
        'lookup_only_no_retrieval',
        'gap_unaddressed',
        'oov_critical_severity',
      ].includes(i.type)),
    grounding_score: score,
  };
}

/**
 * @param {object} assessment
 * @param {object[]} issues
 */
export function applyCriticRepair(assessment, issues) {
  const repair_log = [...(assessment.repair_log ?? [])];
  for (const issue of issues) {
    if (issue.type === 'thin_evidence_strong_claim') {
      assessment.severity = 'abstain';
      assessment.confidence = 'low';
      assessment.operator_status = 'insufficient_data';
      repair_log.push({ issue: issue.type, action: 'downgraded_to_abstain' });
    }
    if (issue.type === 'lookup_only_no_retrieval') {
      assessment.confidence = 'medium';
      repair_log.push({ issue: issue.type, action: 'downgraded_confidence' });
    }
    if (issue.type === 'oov_critical_severity') {
      assessment.severity = 'moderate';
      assessment.operator_status = 'watch';
      repair_log.push({ issue: issue.type, action: 'downgraded_oov_severity' });
    }
    if (issue.type === 'contested_without_dissent') {
      assessment.dissent_summary = assessment.dissent_summary
        || 'Evidence shows mixed supporting and weakening signals across sources.';
      repair_log.push({ issue: issue.type, action: 'added_dissent_summary' });
    }
    if (issue.type === 'missing_evidence_refs') {
      const claim = assessment.claims?.[issue.index];
      if (claim && !claim.evidence_refs?.length) {
        claim.evidence_refs = [`synthetic:${assessment.component_id}:${issue.index}`];
        repair_log.push({ issue: issue.type, action: 'added_synthetic_ref', index: issue.index });
      }
    }
    if (issue.type === 'dominance_unacknowledged') {
      assessment.narrative = `${assessment.narrative}\n\nNote: ${issue.warning}`;
      repair_log.push({ issue: issue.type, action: 'appended_dominance_note' });
    }
    if (issue.type === 'gap_unaddressed') {
      const note = `Gap not fully resolved: ${issue.action}`;
      assessment.retrieval_gaps = [...(assessment.retrieval_gaps ?? []), note];
      if (!String(assessment.narrative ?? '').includes('Gap not fully resolved')) {
        assessment.narrative = `${assessment.narrative}\n\n${note}`;
      }
      repair_log.push({ issue: issue.type, action: 'noted_open_gap', gap_id: issue.gap_id });
    }
  }
  assessment.repair_log = repair_log;
  return assessment;
}
