import { getDefaultLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import {
  verifyEvidenceAgainstArticle,
  tokenize,
  resolveQuoteText,
} from './signalVerification.js';
import { maybeRescueEvidenceWithEmbedding } from './embeddingEvidenceVerifier.js';
import { extractJsonArray } from './claudeJsonHelpers.js';
import {
  GROUNDING_TIER,
  assignGroundingFields,
  groundingMetaFromVerifyPass,
  groundingMetaFromEntailmentFail,
  
  isCriticalForGrounding,
  isGroundingTieredVerifyEnabled,
} from '../domain/services/groundingPolicy.js';
import { recordOutletTelemetry } from '../domain/services/outletReputationDecay.js';

const DEFAULT_SELF_CHECK_MODEL = process.env.RESILIENCE_SELF_CHECK_MODEL ?? 'claude-haiku-4-5-20251001';

const ENTAILMENT_THRESHOLDS = {
  direct_quote_named_person: 0.7,
  named_survey_statistic: 0.5,
  named_institutional_fact: 0.5,
  observational_reported_fact: 0.4,
};

const SHORT_BODY_CHARS = 80;
const SHORT_EVIDENCE_TOKENS = 8;
const FULL_BODY_PREMISE_CHARS = 400;

export function splitParagraphs(body) {
  const raw = String(body ?? '');
  const paras = raw.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const merged = [];
  let buf = '';
  for (const p of paras) {
    if (!buf) {
      buf = p;
      continue;
    }
    if (buf.length < 180) {
      buf += ' ' + p;
    } else {
      merged.push(buf);
      buf = p;
    }
  }
  if (buf) merged.push(buf);
  return merged;
}

function entailmentThreshold(evidenceType) {
  return ENTAILMENT_THRESHOLDS[evidenceType] ?? 0.4;
}

export function isShortEvidence(signal) {
  return tokenize(resolveQuoteText(signal)).length <= SHORT_EVIDENCE_TOKENS;
}

export function isShortBody(articleBody) {
  return typeof articleBody === 'string' && articleBody.trim().length < SHORT_BODY_CHARS;
}

/**
 * Whether to queue LLM entailment for a failed primary verification.
 */
export function shouldQueueEntailmentCheck(signal, primaryResult, articleBody) {
  if (process.env.RESILIENCE_NLI_VERIFY === '0') return false;
  if (!articleBody || typeof articleBody !== 'string' || !articleBody.trim()) return false;
  if (primaryResult?.reason !== 'low_similarity') return false;

  if (isShortEvidence(signal) || isShortBody(articleBody)) return true;

  const sim = primaryResult?.sim;
  if (typeof sim !== 'number' || Number.isNaN(sim)) return false;

  const t = entailmentThreshold(signal?.evidence_type ?? 'observational_reported_fact');
  const low = Number.parseFloat(process.env.RESILIENCE_NLI_BORDERLINE_LOW ?? String(t * 0.65));
  const borderlineLow = Number.isFinite(low) ? Math.max(0.05, Math.min(t - 0.01, low)) : t * 0.65;
  return sim >= borderlineLow && sim < t;
}

export function selectEntailmentPremise(evidence, body, maxChars = 1400) {
  if (isShortBody(body)) {
    const trimmed = body.trim();
    return trimmed.length > FULL_BODY_PREMISE_CHARS
      ? `${trimmed.slice(0, FULL_BODY_PREMISE_CHARS)}...`
      : trimmed;
  }
  return bestMatchingSnippet(evidence, body, maxChars);
}

export function bestMatchingSnippet(evidence, body, maxChars = 1400) {
  const evTokens = tokenize(evidence);
  if (!evTokens.length) return body.slice(0, maxChars);
  const evSet = new Set(evTokens);
  const paragraphs = splitParagraphs(body);
  if (!paragraphs.length) return body.slice(0, maxChars);
  let best = { score: -1, text: paragraphs[0] };
  for (const p of paragraphs.slice(0, 36)) {
    const toks = tokenize(p);
    if (!toks.length) continue;
    let hits = 0;
    for (const tok of toks) {
      if (evSet.has(tok)) hits++;
    }
    const score = hits / Math.sqrt(toks.length);
    if (score > best.score) best = { score, text: p };
  }
  const snippet = best.text.trim();
  return snippet.length > maxChars ? `${snippet.slice(0, maxChars)}...` : snippet;
}

/**
 * Resolve final tier for a signal that failed all automated checks.
 * @returns {{ action: 'keep' | 'drop', meta: { tier: string, reason: string, method: string } }}
 */
export function resolveFailedGrounding(signal, primaryResult) {
  if (!isGroundingTieredVerifyEnabled()) {
    return {
      action: 'drop',
      meta: { tier: GROUNDING_TIER.rejected, reason: primaryResult?.reason ?? 'low_similarity', method: 'containment' },
    };
  }
  if (isCriticalForGrounding(signal)) {
    return {
      action: 'keep',
      meta: {
        tier: GROUNDING_TIER.unverified_critical,
        reason: 'verification_failed_critical',
        method: primaryResult?.reason ?? 'containment',
      },
    };
  }
  return {
    action: 'keep',
    meta: {
      tier: GROUNDING_TIER.weak,
      reason: primaryResult?.reason ?? 'low_similarity',
      method: 'containment',
    },
  };
}

function similaritySuffix(result) {
  if (result?.sim == null) return '';
  return `, sim=${result.sim.toFixed(2)}`;
}

function logDroppedEvidence(sourceLabel, result, signal) {
  const evPreview = (signal.evidence ?? '').slice(0, 80).replaceAll(/\s+/g, ' ');
  console.error(
    `  ⚠ [${sourceLabel}] Dropped unverifiable evidence ` +
    `(${result.reason}${similaritySuffix(result)}): ` +
    `[${signal.signal_type}] "${evPreview}…"`,
  );
}

function logTieredEvidence(sourceLabel, signal, meta) {
  const evPreview = (signal.evidence ?? '').slice(0, 80).replaceAll(/\s+/g, ' ');
  console.error(
    `  ⚠ [${sourceLabel}] Kept ${meta.tier} evidence (${meta.reason}): ` +
    `[${signal.signal_type}] "${evPreview}…"`,
  );
}

function tagVerifiedSignal(signal, verifyResult, rescuedBy = null) {
  const meta = groundingMetaFromVerifyPass(verifyResult, { rescuedBy });
  return assignGroundingFields({ ...signal }, meta);
}

async function verifyOneSignal(s, articles, _sourceLabel) {
  const art = articles[s.article_index - 1];
  const body = art?.body ?? '';
  const result = verifyEvidenceAgainstArticle(s, body);
  if (result.ok) {
    return { status: 'verified', signal: tagVerifiedSignal(s, result), verifyResult: result };
  }

  const emb = await maybeRescueEvidenceWithEmbedding(s, body, result);
  if (emb.ok) {
    return {
      status: 'verified',
      signal: tagVerifiedSignal(s, result, 'embedding'),
      verifyResult: result,
    };
  }

  if (shouldQueueEntailmentCheck(s, result, body)) {
    return { status: 'borderline', signal: s, artBody: body, primary: result };
  }

  const resolved = resolveFailedGrounding(s, result);
  if (resolved.action === 'drop') {
    return { status: 'dropped', reason: result.reason, result };
  }
  assignGroundingFields(s, resolved.meta);
  return { status: 'tiered', signal: s, meta: resolved.meta };
}

function recordTieredSignal(kept, tierCounts, sourceLabel, signal, meta, outlet) {
  kept.push(signal);
  logTieredEvidence(sourceLabel, signal, meta);
  if (meta.tier === GROUNDING_TIER.unverified_critical) tierCounts.tier_c++;
  else tierCounts.tier_b++;
  if (outlet) recordOutletTelemetry(outlet, { verified: 1 });
}

function applyVerifyOutcome(outcome, outlet, sourceLabel, signal, ctx) {
  if (outcome.status === 'verified') {
    ctx.kept.push(outcome.signal);
    ctx.tierCounts.tier_a++;
    if (outlet) recordOutletTelemetry(outlet, { verified: 1 });
    return;
  }
  if (outcome.status === 'borderline') {
    ctx.borderline.push({ s: outcome.signal, artBody: outcome.artBody, primary: outcome.primary });
    return;
  }
  if (outcome.status === 'tiered') {
    recordTieredSignal(ctx.kept, ctx.tierCounts, sourceLabel, outcome.signal, outcome.meta, outlet);
    return;
  }
  ctx.dropped++;
  ctx.reasonCounts[outcome.reason] = (ctx.reasonCounts[outcome.reason] || 0) + 1;
  if (outlet) recordOutletTelemetry(outlet, { dropped: 1 });
  logDroppedEvidence(sourceLabel, outcome.result, signal);
}

function applyEntailmentOutcome(out, sourceLabel, ctx) {
  const outlet = out.signal?.article_source;
  if (out.kept) {
    ctx.kept.push(out.signal);
    ctx.tierCounts.tier_a++;
    if (outlet) recordOutletTelemetry(outlet, { verified: 1 });
    return;
  }
  if (out.tiered) {
    recordTieredSignal(ctx.kept, ctx.tierCounts, sourceLabel, out.signal, out.meta, outlet);
    return;
  }
  ctx.dropped++;
  ctx.reasonCounts.entailment_reject = (ctx.reasonCounts.entailment_reject || 0) + 1;
  if (outlet) recordOutletTelemetry(outlet, { dropped: 1 });
}

export async function applyEvidenceVerifier(signals, articles, sourceLabel, usageCallback = null) {
  const ctx = {
    kept: [],
    borderline: [],
    dropped: 0,
    reasonCounts: {},
    tierCounts: { tier_a: 0, tier_b: 0, tier_c: 0 },
  };

  for (const s of signals) {
    const outcome = await verifyOneSignal(s, articles, sourceLabel);
    applyVerifyOutcome(outcome, s.article_source, sourceLabel, s, ctx);
  }

  if (ctx.borderline.length > 0) {
    const entailmentOutcomes = await runEntailmentVerifier(ctx.borderline, sourceLabel, usageCallback);
    for (const out of entailmentOutcomes) {
      applyEntailmentOutcome(out, sourceLabel, ctx);
    }
  }

  const { kept, dropped, reasonCounts, tierCounts } = ctx;

  if (dropped > 0) {
    console.error(`  → [${sourceLabel}] verifier dropped ${dropped}/${signals.length} signal(s)`);
  }
  if (usageCallback) {
    usageCallback({
      label: `${sourceLabel} verifier`,
      stage: 'evidence_verifier',
      stats: {
        kept: kept.length,
        dropped,
        input: signals.length,
        tier_a: tierCounts.tier_a,
        tier_b: tierCounts.tier_b,
        tier_c: tierCounts.tier_c,
        reason_counts: reasonCounts,
      },
    });
  }
  return kept;
}

function parseEntailmentVerdicts(text, itemCount) {
  const verdicts = extractJsonArray(text);
  const keep = new Set();
  if (!Array.isArray(verdicts)) return keep;
  for (const v of verdicts) {
    const idx = Number(v?.i);
    const verdict = String(v?.verdict ?? '').toLowerCase();
    if (!Number.isInteger(idx) || idx < 0 || idx >= itemCount) continue;
    if (verdict === 'entails') keep.add(idx);
  }
  return keep;
}

/**
 * @returns {Promise<Array<{ kept?: boolean, tiered?: boolean, signal: object, meta?: object }>>}
 */
export async function runEntailmentVerifier(borderlineItems, sourceLabel, usageCallback) {
  if (process.env.RESILIENCE_NLI_VERIFY === '0') {
    return borderlineItems.map((it) => {
      const resolved = resolveFailedGrounding(it.s, it.primary);
      if (resolved.action === 'drop') {
        return { kept: false, signal: it.s };
      }
      assignGroundingFields(it.s, resolved.meta);
      return { tiered: true, signal: it.s, meta: resolved.meta };
    });
  }
  if (!borderlineItems.length) return [];

  const maxItems = Math.max(0, Math.min(30, Number.parseInt(process.env.RESILIENCE_NLI_MAX_ITEMS ?? '18', 10) || 18));
  const items = borderlineItems.slice(0, maxItems);
  const model = process.env.RESILIENCE_NLI_MODEL ?? DEFAULT_SELF_CHECK_MODEL;

  const system =
    `You are an entailment verifier.\n` +
    `Given a PREMISE excerpt and a HYPOTHESIS statement, decide whether the premise entails the hypothesis.\n` +
    `Output JSON array of {"i":N,"verdict":"entails"|"neutral"|"contradicts"}.\n` +
    `Be conservative: if the premise does not clearly support the hypothesis, choose "neutral".\n` +
    `Do not use outside knowledge.\n`;

  const lines = items.map((it, i) => {
    const ev = resolveQuoteText(it.s).trim().slice(0, 320);
    const premise = selectEntailmentPremise(ev, it.artBody, 1400);
    return (
      `CASE ${i}\n` +
      `signal_type: ${it.s?.signal_type ?? 'unknown'}\n` +
      `evidence_type: ${it.s?.evidence_type ?? 'unknown'}\n` +
      `PREMISE:\n${premise}\n\n` +
      `HYPOTHESIS:\n${ev}\n`
    );
  }).join('\n\n---\n\n');

  const user = `Evaluate these cases:\n\n${lines}\n\nReturn only the JSON array.`;

  try {
    const response = await getDefaultLlmPort().createMessage({
      model,
      max_tokens: Math.min(2500, 200 + items.length * 60),
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
      callContext: { feature: 'evidence_entailment', purpose: `${sourceLabel} entailment` },
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock ? textBlock.text : '';
    const keep = parseEntailmentVerdicts(text, items.length);

    const outcomes = [];
    for (let i = 0; i < items.length; i++) {
      if (keep.has(i)) {
        const tagged = tagVerifiedSignal(items[i].s, items[i].primary, 'entailment');
        outcomes.push({ kept: true, signal: tagged });
      } else {
        const evPreview = resolveQuoteText(items[i].s).slice(0, 80).replaceAll(/\s+/g, ' ');
        if (!isGroundingTieredVerifyEnabled()) {
          console.error(`  ⚠ [${sourceLabel}] Dropped by entailment gate: [${items[i].s?.signal_type}] "${evPreview}…"`);
          outcomes.push({ kept: false, signal: items[i].s });
          continue;
        }
        const meta = groundingMetaFromEntailmentFail(items[i].s);
        assignGroundingFields(items[i].s, meta);
        console.error(
          `  ⚠ [${sourceLabel}] Entailment failed — kept as ${meta.tier}: [${items[i].s?.signal_type}] "${evPreview}…"`,
        );
        outcomes.push({ tiered: true, signal: items[i].s, meta });
      }
    }
    if (usageCallback) {
      const keptCount = outcomes.filter((o) => o.kept).length;
      const tieredCount = outcomes.filter((o) => o.tiered).length;
      usageCallback({
        label: `${sourceLabel} entailment`,
        stage: 'entailment_verifier',
        model,
        stats: {
          kept: keptCount,
          tiered: tieredCount,
          dropped: outcomes.length - keptCount - tieredCount,
          input: items.length,
        },
      });
    }
    return outcomes;
  } catch (err) {
    console.error(`  ⚠ [${sourceLabel}] entailment verifier failed (${err.message}) — tiering borderline signals`);
    return borderlineItems.map((it) => {
      const resolved = resolveFailedGrounding(it.s, it.primary);
      assignGroundingFields(it.s, resolved.meta);
      return { tiered: true, signal: it.s, meta: resolved.meta };
    });
  }
}



export {deriveTierFromVerifyFailure, isCriticalForGrounding} from '../domain/services/groundingPolicy.js';