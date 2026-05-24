/**
 * Learning-capture hooks during signal extraction (OOV, near-miss, residual).
 */

import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import {
  bufferOovCapture,
  isLearningCaptureEnabled,
  isResidualCaptureEnabled,
  LEARNING_CAPTURE_KINDS,
} from '../domain/services/oovCapture.js';
import { buildResidualCapturePrompt } from './extractionPasses.js';
import { extractTopKParagraphsForLearning } from './learningCaptureText.js';

const client = new Anthropic();

const DEFAULT_RESIDUAL_MODEL = process.env.RESILIENCE_RESIDUAL_MODEL
  ?? process.env.RESILIENCE_SELF_CHECK_MODEL
  ?? 'claude-haiku-4-5-20251001';

/**
 * @param {string} text
 */
function extractJsonArray(text) {
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart === -1 || arrEnd === -1) throw new Error('No JSON array in response');
  const raw = text.slice(arrStart, arrEnd + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(jsonrepair(raw));
  }
}

/**
 * @param {object} signal
 * @param {string} batchLabel
 */
export function logSelfCheckUncertain(signal, batchLabel) {
  if (!isLearningCaptureEnabled()) return;
  bufferOovCapture({
    capture_kind: LEARNING_CAPTURE_KINDS.SELF_CHECK_UNCERTAIN,
    signal_type: signal.signal_type,
    evidence: signal.evidence ?? null,
    evidence_type: signal.evidence_type ?? null,
    source_label: batchLabel,
    article_index: signal.article_index ?? null,
    article_url: signal.article_url ?? null,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Articles in batch with no surviving signals after extraction.
 * @param {Array<object>} articles
 * @param {Array<object>} signals
 * @param {string} batchLabel
 */
export function logZeroSignalArticles(articles, signals, batchLabel) {
  if (!isLearningCaptureEnabled() || !articles.length) return;

  const covered = new Set(
    signals
      .map((s) => Number(s?.article_index))
      .filter((n) => Number.isInteger(n) && n >= 1),
  );

  for (let i = 0; i < articles.length; i++) {
    const idx = i + 1;
    if (covered.has(idx)) continue;
    const art = articles[i];
    bufferOovCapture({
      capture_kind: LEARNING_CAPTURE_KINDS.ZERO_SIGNAL_ARTICLE,
      article_index: idx,
      article_url: art?.url ?? art?.article_url ?? null,
      article_source: art?.source ?? null,
      snippet: extractTopKParagraphsForLearning(art?.body ?? art?.promptBody ?? '', 2),
      source_label: batchLabel,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Cheap open-vocab pass for zero-signal articles — observations only, not scored.
 * @param {Array<object>} articles
 * @param {string} batchLabel
 * @param {Function|null} usageCallback
 */
export async function runResidualCapture(articles, batchLabel, usageCallback = null) {
  if (!isLearningCaptureEnabled() || !isResidualCaptureEnabled() || !articles.length) {
    return 0;
  }

  const { system, user } = buildResidualCapturePrompt(articles);
  const model = DEFAULT_RESIDUAL_MODEL;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: Math.min(4000, 400 + articles.length * 120),
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (usageCallback) {
      usageCallback({ label: `${batchLabel} residual-capture`, model, usage: response.usage });
    }
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) return 0;
    const observations = extractJsonArray(textBlock.text);
    if (!Array.isArray(observations)) return 0;

    let n = 0;
    for (const obs of observations) {
      if (!obs || typeof obs !== 'object') continue;
      const evidence = String(obs.evidence ?? '').trim();
      if (!evidence) continue;
      bufferOovCapture({
        capture_kind: LEARNING_CAPTURE_KINDS.RESIDUAL_OBSERVATION,
        behavioral_description: obs.behavioral_description ?? null,
        evidence,
        nearest_existing_types: Array.isArray(obs.nearest_existing_types)
          ? obs.nearest_existing_types.slice(0, 5)
          : [],
        novelty_hint: obs.novelty_hint ?? null,
        article_index: obs.article_index ?? null,
        source_label: batchLabel,
        timestamp: new Date().toISOString(),
      });
      n += 1;
    }
    if (n > 0) {
      console.error(`  → [${batchLabel}] residual capture: ${n} observation(s)`);
    }
    return n;
  } catch (err) {
    console.error(`  ⚠ [${batchLabel}] residual capture failed (${err.message})`);
    return 0;
  }
}

/**
 * @param {Array<object>} articles
 * @param {Array<object>} signals
 * @param {string} batchLabel
 * @param {Function|null} usageCallback
 */
export async function captureBatchLearningSignals(articles, signals, batchLabel, usageCallback = null) {
  logZeroSignalArticles(articles, signals, batchLabel);

  const covered = new Set(
    signals
      .map((s) => Number(s?.article_index))
      .filter((n) => Number.isInteger(n) && n >= 1),
  );
  const zeroSignalArticles = articles.filter((_, i) => !covered.has(i + 1));
  return runResidualCapture(zeroSignalArticles, batchLabel, usageCallback);
}
