/**
 * Sentence-level narrative grounding scores (post-hoc prose vs cited evidence QA).
 *
 * Pipeline position: after narrative LLM output parse — computes narrative_grounding_score
 * per component; NOT GROUNDING_TIER signal verification.
 *
 * Owns: scoreTextGrounding, computeGroundingScores, interpretive_summary flag.
 * Does NOT: block publish (see groundingConfig block flag) or validate JSON schema.
 *
 * Key collaborators: `narrativeTextUtils.js`, `groundingConfig.js`, `signalRefRegistry.js`,
 * app claudeNarratives / operatorNarrativePipeline.
 */

import { RESILIENCE_COMPONENTS } from '../../resilienceComponents.js';
import {
  EVIDENCE_OVERLAP_MIN,
  narrativeGroundingMinScore,
} from './groundingConfig.js';
import { resolveRef } from '../narrative/signalRefRegistry.js';
import {
  bestEvidenceOverlap,
  splitSentences,
  stripMarkdownLinks,
} from './narrativeTextUtils.js';

function componentEvidenceTexts(scored, registry, componentId, claims) {
  const texts = [];
  for (const s of scored?.signals ?? []) {
    if (s?.evidence) texts.push(s.evidence);
  }
  for (const claim of claims ?? []) {
    for (const ref of claim?.signal_refs ?? []) {
      const entry = resolveRef(ref, registry);
      if (entry?.signal?.evidence) texts.push(entry.signal.evidence);
    }
  }
  return texts;
}

// ── Sentence scoring ────────────────────────────────────────────────────────────

/**
 * Score how well prose sentences overlap cited evidence texts (0–1).
 *
 * @param {string} text Narrative prose.
 * @param {string[]} evidenceTexts Cited signal evidence strings.
 * @returns {{ score: number, issues: Array<object> }}
 */
export function scoreTextGrounding(text, evidenceTexts) {
  const sentences = splitSentences(stripMarkdownLinks(text));
  if (sentences.length === 0) return { score: 1, issues: [] };

  const issues = [];
  let grounded = 0;
  for (const sentence of sentences) {
    const overlap = bestEvidenceOverlap(sentence, evidenceTexts);
    if (overlap >= EVIDENCE_OVERLAP_MIN * 0.5) {
      grounded += 1;
    } else {
      issues.push({ sentence, overlap, reason: 'low_evidence_overlap' });
    }
  }
  const score = grounded / sentences.length;
  return { score: Math.round(score * 1000) / 1000, issues };
}

// ── Assessment-wide grounding ───────────────────────────────────────────────────

/**
 * Compute per-component and synthesis narrative_grounding_score from LLM output.
 *
 * @param {object} narratives LLM output object.
 * @param {Record<string, object>} scoredComponents Digest/scored components by id.
 * @param {{ byRef: Map<string, object> }} registry Signal ref registry.
 * @returns {object} byComponent scores, synthesis score, summary, allIssues.
 */
export function computeGroundingScores(narratives, scoredComponents, registry) {
  const byComponent = {};
  const allIssues = [];

  for (const def of RESILIENCE_COMPONENTS) {
    const compNarr = (narratives.components ?? []).find((c) => c.component_id === def.id) ?? {};
    const scored = scoredComponents[def.id] ?? {};
    const evidenceTexts = componentEvidenceTexts(
      scored,
      registry,
      def.id,
      compNarr.narrative_claims,
    );
    const narrative = compNarr.narrative ?? '';
    const { score, issues } = scoreTextGrounding(narrative, evidenceTexts);
    byComponent[def.id] = {
      score,
      issues,
      interpretive_summary: score < narrativeGroundingMinScore(),
    };
    for (const issue of issues) {
      allIssues.push({ component_id: def.id, ...issue });
    }
  }

  const synthesis = narratives.cross_component_synthesis ?? '';
  const allEvidence = [];
  for (const def of RESILIENCE_COMPONENTS) {
    const scored = scoredComponents[def.id] ?? {};
    allEvidence.push(...componentEvidenceTexts(scored, registry, def.id, []));
  }
  const synthResult = scoreTextGrounding(synthesis, allEvidence);

  const componentScores = Object.values(byComponent).map((c) => c.score);
  const mean = componentScores.length
    ? componentScores.reduce((s, v) => s + v, 0) / componentScores.length
    : 1;
  const threshold = narrativeGroundingMinScore();
  const belowThreshold = Object.entries(byComponent)
    .filter(([, v]) => v.score < threshold)
    .map(([id]) => id);

  return {
    byComponent,
    synthesis: synthResult,
    summary: {
      mean_score: Math.round(mean * 1000) / 1000,
      synthesis_score: synthResult.score,
      components_below_threshold: belowThreshold,
      threshold,
    },
    allIssues,
  };
}
