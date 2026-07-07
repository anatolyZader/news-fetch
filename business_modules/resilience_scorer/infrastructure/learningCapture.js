/**
 * Learning-capture hooks during signal extraction (OOV, near-miss, residual).
 */

import {
  bufferOovCapture,
  isLearningCaptureEnabled,
  isResidualCaptureEnabled,
  LEARNING_CAPTURE_KINDS,
} from '../domain/services/oovCapture.js';
import { extractTopKParagraphsForLearning } from './learningCaptureText.js';

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

  try {
    const { createDefaultSignalsExtractionService } = await import(
      '../../signals_extraction/index.js'
    );
    const service = createDefaultSignalsExtractionService();
    const date = new Date().toISOString().slice(0, 10);
    const { observations, path } = await service.extractResidual(articles, {
      date,
      batchLabel,
      onUsage: usageCallback,
    });

    let n = 0;
    for (const obs of observations) {
      const evidence = String(obs.evidence ?? '').trim();
      if (!evidence) continue;
      const ts = new Date().toISOString();
      const base = {
        behavioral_description: obs.behavioral_description ?? null,
        evidence,
        nearest_existing_types: obs.nearest_existing_types ?? obs.suggested_catalog_types ?? [],
        novelty_hint: obs.novelty_hint ?? null,
        article_index: obs.article_index ?? null,
        source_label: batchLabel,
        timestamp: ts,
      };
      bufferOovCapture({
        capture_kind: LEARNING_CAPTURE_KINDS.RESIDUAL_OBSERVATION,
        ...base,
      });
      bufferOovCapture({
        capture_kind: LEARNING_CAPTURE_KINDS.OPEN_OBSERVATION,
        observation_profile: 'residual',
        suggested_type: obs.suggested_catalog_types?.[0] ?? null,
        ...base,
      });
      n += 1;
    }
    if (n > 0) {
      const pathNote = path ? ` → ${path}` : '';
      console.error(`  → [${batchLabel}] residual capture: ${n} observation(s)${pathNote}`);
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
