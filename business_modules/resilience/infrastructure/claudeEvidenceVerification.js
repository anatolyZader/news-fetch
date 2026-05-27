import Anthropic from '@anthropic-ai/sdk';
import { verifyEvidenceAgainstArticle, tokenize } from './signalVerification.js';
import { maybeRescueEvidenceWithEmbedding } from './embeddingEvidenceVerifier.js';
import { extractJsonArray } from './claudeJsonHelpers.js';

const client = new Anthropic();
const DEFAULT_SELF_CHECK_MODEL = process.env.RESILIENCE_SELF_CHECK_MODEL ?? 'claude-haiku-4-5-20251001';

const ENTAILMENT_THRESHOLDS = {
  direct_quote_named_person: 0.7,
  named_survey_statistic: 0.5,
  named_institutional_fact: 0.5,
  observational_reported_fact: 0.4,
};

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

export function shouldQueueEntailmentCheck(signal, primaryResult, articleBody) {
  if (process.env.RESILIENCE_NLI_VERIFY === '0') return false;
  if (!articleBody || typeof articleBody !== 'string' || articleBody.trim().length < 80) {
    return false;
  }
  if (primaryResult?.reason !== 'low_similarity') return false;
  const sim = primaryResult?.sim;
  if (typeof sim !== 'number' || Number.isNaN(sim)) return false;

  const t = entailmentThreshold(signal?.evidence_type ?? 'observational_reported_fact');
  const low = Number.parseFloat(process.env.RESILIENCE_NLI_BORDERLINE_LOW ?? String(t * 0.65));
  const borderlineLow = Number.isFinite(low) ? Math.max(0.05, Math.min(t - 0.01, low)) : t * 0.65;
  return sim >= borderlineLow && sim < t;
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

function similaritySuffix(result) {
  if (result.sim == null) return '';
  return `, sim=${result.sim.toFixed(2)}`;
}

function logDroppedEvidence(sourceLabel, result, signal) {
  const evPreview = (signal.evidence ?? '').slice(0, 80).replace(/\s+/g, ' ');
  console.error(
    `  ⚠ [${sourceLabel}] Dropped unverifiable evidence ` +
    `(${result.reason}${similaritySuffix(result)}): ` +
    `[${signal.signal_type}] "${evPreview}…"`,
  );
}

async function verifyOneSignal(s, articles, _sourceLabel) {
  const art = articles[s.article_index - 1];
  const result = verifyEvidenceAgainstArticle(s, art?.body);
  if (result.ok) return { status: 'verified', signal: s };

  const emb = await maybeRescueEvidenceWithEmbedding(s, art?.body, result);
  if (emb.ok) return { status: 'verified', signal: s };

  if (shouldQueueEntailmentCheck(s, result, art?.body)) {
    return { status: 'borderline', signal: s, artBody: art?.body ?? '', primary: result };
  }

  return { status: 'dropped', reason: result.reason, result };
}

export async function applyEvidenceVerifier(signals, articles, sourceLabel, usageCallback = null) {
  const verified = [];
  const borderline = [];
  let dropped = 0;
  const reasonCounts = {};

  for (const s of signals) {
    const outcome = await verifyOneSignal(s, articles, sourceLabel);
    if (outcome.status === 'verified') {
      verified.push(outcome.signal);
      continue;
    }
    if (outcome.status === 'borderline') {
      borderline.push({ s: outcome.signal, artBody: outcome.artBody, primary: outcome.primary });
      continue;
    }
    dropped++;
    reasonCounts[outcome.reason] = (reasonCounts[outcome.reason] || 0) + 1;
    logDroppedEvidence(sourceLabel, outcome.result, s);
  }

  if (borderline.length > 0) {
    const kept = await runEntailmentVerifier(borderline, sourceLabel, usageCallback);
    for (const item of kept) verified.push(item);
    dropped += borderline.length - kept.length;
    if (dropped > 0) {
      reasonCounts.entailment_reject = (reasonCounts.entailment_reject || 0) + (borderline.length - kept.length);
    }
  }

  if (dropped > 0) {
    console.error(`  → [${sourceLabel}] verifier dropped ${dropped}/${signals.length} signal(s)`);
  }
  if (usageCallback) {
    usageCallback({
      label: `${sourceLabel} verifier`,
      stage: 'evidence_verifier',
      stats: {
        kept: verified.length,
        dropped,
        input: signals.length,
        reason_counts: reasonCounts,
      },
    });
  }
  return verified;
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

export async function runEntailmentVerifier(borderlineItems, sourceLabel, usageCallback) {
  if (process.env.RESILIENCE_NLI_VERIFY === '0') return [];
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
    const ev = String(it.s?.evidence ?? '').trim().slice(0, 320);
    const premise = bestMatchingSnippet(ev, it.artBody, 1400);
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
    const response = await client.messages.create({
      model,
      max_tokens: Math.min(2500, 200 + items.length * 60),
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock ? textBlock.text : '';
    const keep = parseEntailmentVerdicts(text, items.length);

    const kept = [];
    for (let i = 0; i < items.length; i++) {
      if (keep.has(i)) {
        kept.push(items[i].s);
      } else {
        const evPreview = String(items[i].s?.evidence ?? '').slice(0, 80).replace(/\s+/g, ' ');
        console.error(`  ⚠ [${sourceLabel}] Dropped by entailment gate: [${items[i].s?.signal_type}] "${evPreview}…"`);
      }
    }
    if (usageCallback) {
      usageCallback({
        label: `${sourceLabel} entailment`,
        stage: 'entailment_verifier',
        model,
        stats: { kept: kept.length, dropped: items.length - kept.length, input: items.length },
      });
    }
    return kept;
  } catch (err) {
    console.error(`  ⚠ [${sourceLabel}] entailment verifier failed (${err.message}) — keeping borderline signals`);
    return items.map((x) => x.s);
  }
}
