/**
 * Haiku relation judge: detect invented relationships in narrative claims.
 * Default: one batched call per component (RESILIENCE_NARRATIVE_JUDGE_BATCH=0 for per-claim).
 */

import Anthropic from '@anthropic-ai/sdk';
import { extractJson } from './claudeJsonHelpers.js';
import { streamWithProgress } from './claudeExtraction.js';
import { resolveRef } from '../domain/services/narrativeGrounding/index.js';

const client = new Anthropic();
const DEFAULT_JUDGE_MODEL = process.env.RESILIENCE_NARRATIVE_JUDGE_MODEL
  ?? process.env.RESILIENCE_SELF_CHECK_MODEL
  ?? 'claude-haiku-4-5-20251001';

function batchJudgeEnabled() {
  if (process.env.RESILIENCE_NARRATIVE_JUDGE_BATCH === '0') return false;
  return true;
}

function buildJudgeSystemPrompt() {
  return (
    'You judge whether narrative claims are entailed by their cited evidence lines ONLY.\n' +
    'You have NO world knowledge — judge text overlap and logical connection only.\n' +
    'Return ONLY valid JSON:\n' +
    '{ "verdicts": [ { "i": 0, "entailed": true|false, "invented_relation": true|false, "reason": "<optional>" }, ... ] }\n\n' +
    'Set invented_relation=true when the claim:\n' +
    '- Links two unrelated evidence items with causal language (because, therefore, led to, despite, etc.)\n' +
    '- Asserts a connection not supported by shared article URL or explicit co-mention\n' +
    '- Adds actors, events, or timelines absent from the evidence lines\n'
  );
}

function buildPerClaimSystemPrompt() {
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

function formatClaimForJudge(claim, registry, caseIndex) {
  const evidenceLines = (claim.signal_refs ?? []).map((ref) => {
    const entry = resolveRef(ref, registry);
    return entry?.signal?.evidence ?? ref;
  });
  const numberedEvidence = evidenceLines.map(formatEvidenceLine).join('\n');
  const prefix = caseIndex == null ? '' : `CASE ${caseIndex}\n`;
  return (
    `${prefix}Claim: ${claim.text}\n` +
    `Relation tag: ${claim.relation ?? 'parallel'}\n` +
    `Evidence lines:\n${numberedEvidence}`
  );
}

function parseBatchVerdicts(text, claimCount) {
  let parsed;
  try {
    parsed = extractJson(text);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed?.verdicts) ? parsed.verdicts : (Array.isArray(parsed) ? parsed : null);
  if (!list) return null;
  const byIndex = new Map();
  for (const v of list) {
    const idx = Number(v?.i);
    if (!Number.isInteger(idx) || idx < 0 || idx >= claimCount) continue;
    byIndex.set(idx, v);
  }
  return byIndex;
}

/**
 * @param {Array<object>} claims
 * @param {object} comp
 * @param {{ byRef: Map<string, object> }} registry
 * @param {{ onUsage?: Function }} [opts]
 */
async function judgeComponentClaimsBatch(claims, comp, registry, opts = {}) {
  const apiClient = opts.client ?? client;
  if (!claims.length) return [];

  const blocks = claims.map((claim, i) => formatClaimForJudge(claim, registry, i)).join('\n\n---\n\n');
  const userContent =
    `Component: ${comp.component_id}\n` +
    `Evaluate ${claims.length} case(s). Return verdicts array with "i" matching CASE numbers.\n\n` +
    blocks;

  const maxTokens = Math.min(4000, 200 + claims.length * 80);
  const stream = apiClient.messages.stream({
    model: DEFAULT_JUDGE_MODEL,
    max_tokens: maxTokens,
    temperature: 0,
    system: buildJudgeSystemPrompt(),
    messages: [{ role: 'user', content: userContent }],
  });
  if (!opts.skipProgress) await streamWithProgress(stream, `[Step 2 — Judge batch ${comp.component_id}]`);
  const message = await stream.finalMessage();
  if (opts.onUsage) {
    opts.onUsage({
      label: `[Step 2 — Judge batch ${comp.component_id}]`,
      model: DEFAULT_JUDGE_MODEL,
      usage: message.usage,
    });
  }
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) return [];

  const byIndex = parseBatchVerdicts(textBlock.text, claims.length);
  if (!byIndex) return [];

  const failures = [];
  for (let i = 0; i < claims.length; i++) {
    const verdict = byIndex.get(i);
    if (verdict?.invented_relation === true) {
      failures.push({
        component_id: comp.component_id,
        claim: claims[i],
        verdict,
      });
    }
  }
  return failures;
}

/**
 * @param {object} claim
 * @param {object} comp
 * @param {{ byRef: Map<string, object> }} registry
 * @param {{ onUsage?: Function }} [opts]
 */
async function judgeOneNarrativeClaim(claim, comp, registry, opts = {}) {
  if (!claim?.text) return null;
  const apiClient = opts.client ?? client;
  const userContent = formatClaimForJudge(claim, registry);
  const stream = apiClient.messages.stream({
    model: DEFAULT_JUDGE_MODEL,
    max_tokens: 512,
    temperature: 0,
    system: buildPerClaimSystemPrompt(),
    messages: [{ role: 'user', content: userContent }],
  });
  if (!opts.skipProgress) await streamWithProgress(stream, '[Step 2 — Judge]');
  const message = await stream.finalMessage();
  if (opts.onUsage) {
    opts.onUsage({ label: '[Step 2 — Judge]', model: DEFAULT_JUDGE_MODEL, usage: message.usage });
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
  const useBatch = batchJudgeEnabled();

  for (const comp of narratives?.components ?? []) {
    const claims = comp.narrative_claims ?? [];
    if (!claims.length) continue;

    if (useBatch) {
      const batchFailures = await judgeComponentClaimsBatch(claims, comp, registry, opts);
      failures.push(...batchFailures);
      continue;
    }

    for (const claim of claims) {
      const failure = await judgeOneNarrativeClaim(claim, comp, registry, {
        ...opts,
        client: opts.client,
      });
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
