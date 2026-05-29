/**
 * Haiku relation judge: detect invented relationships in narrative claims.
 */

import Anthropic from '@anthropic-ai/sdk';
import { extractJson } from './claudeJsonHelpers.js';
import { streamWithProgress } from './claudeExtraction.js';
import { resolveRef } from '../domain/services/narrativeGrounding/index.js';

const client = new Anthropic();
const DEFAULT_JUDGE_MODEL = process.env.RESILIENCE_NARRATIVE_JUDGE_MODEL
  ?? process.env.RESILIENCE_SELF_CHECK_MODEL
  ?? 'claude-haiku-4-5-20251001';

function buildJudgeSystemPrompt() {
  return (
    'You judge whether a narrative claim is entailed by its cited evidence lines ONLY.\n' +
    'You have NO world knowledge — judge text overlap and logical connection only.\n' +
    'Return ONLY valid JSON:\n' +
    '{ "entailed": true|false, "invented_relation": true|false, "reason": "<optional>" }\n\n' +
    'Set invented_relation=true when the claim:\n' +
    '- Links two unrelated evidence items with causal language (because, therefore, led to, despite, etc.)\n' +
    '- Asserts a connection not supported by shared article URL or explicit co-mention\n' +
    '- Adds actors, events, or timelines absent from the evidence lines\n'
  );
}

function formatEvidenceLine(evidence, index) {
  return `  ${index + 1}. "${evidence}"`;
}

function formatClaimForJudge(claim, registry) {
  const evidenceLines = (claim.signal_refs ?? []).map((ref) => {
    const entry = resolveRef(ref, registry);
    return entry?.signal?.evidence ?? ref;
  });
  const numberedEvidence = evidenceLines.map(formatEvidenceLine).join('\n');
  return (
    `Claim: ${claim.text}\n` +
    `Relation tag: ${claim.relation ?? 'parallel'}\n` +
    `Evidence lines:\n${numberedEvidence}`
  );
}

/**
 * @param {object} claim
 * @param {object} comp
 * @param {{ byRef: Map<string, object> }} registry
 * @param {{ onUsage?: Function }} [opts]
 * @returns {Promise<{ component_id: string, claim: object, verdict: object } | null>}
 */
async function judgeOneNarrativeClaim(claim, comp, registry, { onUsage } = {}) {
  if (!claim?.text) return null;
  const userContent = formatClaimForJudge(claim, registry);
  const stream = client.messages.stream({
    model: DEFAULT_JUDGE_MODEL,
    max_tokens: 512,
    temperature: 0,
    system: buildJudgeSystemPrompt(),
    messages: [{ role: 'user', content: userContent }],
  });
  await streamWithProgress(stream, '[Step 2 — Judge]');
  const message = await stream.finalMessage();
  if (onUsage) {
    onUsage({ label: '[Step 2 — Judge]', model: DEFAULT_JUDGE_MODEL, usage: message.usage });
  }
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) return null;
  let verdict;
  try {
    verdict = extractJson(textBlock.text);
  } catch {
    return null;
  }
  if (verdict.invented_relation === true) {
    return { component_id: comp.component_id, claim, verdict };
  }
  return null;
}

/**
 * @param {object} narratives LLM output with narrative_claims
 * @param {{ byRef: Map<string, object> }} registry
 * @param {{ onUsage?: Function }} [opts]
 * @returns {Promise<{ ok: boolean, failures: Array<{ component_id: string, claim: object, verdict: object }> }>}
 */
export async function judgeNarrativeRelations(narratives, registry, opts = {}) {
  const failures = [];

  for (const comp of narratives?.components ?? []) {
    for (const claim of comp.narrative_claims ?? []) {
      const failure = await judgeOneNarrativeClaim(claim, comp, registry, opts);
      if (failure) failures.push(failure);
    }
  }

  return { ok: failures.length === 0, failures };
}

/**
 * @param {Array<{ component_id: string, claim: object, verdict: object }>} failures
 */
export function formatJudgeFeedback(failures) {
  if (!failures?.length) return '';
  const lines = failures.map((f) =>
    `${f.component_id}: invented relation in claim "${f.claim.text}" — ${f.verdict.reason ?? 'unsupported link'}`);
  return `Relation judge rejected claims:\n- ${lines.join('\n- ')}`;
}
