/**
 * Per-invocation LLM telemetry (append-only JSONL).
 */
import { join } from 'node:path';
import { defaultLogDataDir } from '../log/infrastructure/logPaths.js';
import { appendJsonlRecord, readJsonlRecords } from '../log/infrastructure/jsonlLog.js';
import { calcLlmCostUsd, normalizeUsageTokens } from './llmPricing.js';

/**
 * @param {string} [rootDir]
 */
export function resolveLlmInvocationsPath(rootDir = process.cwd()) {
  const env = process.env.LLM_INVOCATIONS_PATH?.trim();
  if (!env) return join(defaultLogDataDir(), 'llm-invocations.jsonl');
  return env.startsWith('/') ? env : join(rootDir, env);
}

/**
 * @param {object} record
 */
export function appendLlmInvocation(record) {
  try {
    appendJsonlRecord(resolveLlmInvocationsPath(), record);
  } catch (err) {
    console.error(`⚠ Could not write LLM invocation log: ${err.message}`);
  }
}

/**
 * @param {{
 *   callContext?: import('./llmCallContext.js').LlmCallContext,
 *   model?: string,
 *   usage?: object,
 *   costUsd?: number,
 *   latencyMs?: number,
 *   stopReason?: string|null,
 *   label?: string,
 * }} payload
 */
export function logLlmInvocation(payload) {
  const ctx = payload.callContext ?? {};
  const model = payload.model ?? 'unknown';
  const tokens = normalizeUsageTokens(payload.usage);
  const costUsd = typeof payload.costUsd === 'number'
    ? payload.costUsd
    : calcLlmCostUsd(model, payload.usage);

  appendLlmInvocation({
    timestamp: new Date().toISOString(),
    requestId: ctx.requestId ?? null,
    feature: ctx.feature ?? 'unknown',
    agentName: ctx.agentName ?? null,
    purpose: ctx.purpose ?? payload.label ?? null,
    promptId: ctx.promptId ?? null,
    promptVersion: ctx.promptVersion ?? null,
    schemaVersion: ctx.schemaVersion ?? null,
    model,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cachedInputTokens: tokens.cachedInputTokens,
    cacheCreationTokens: tokens.cacheCreationTokens,
    costUsd: Math.round(costUsd * 1e8) / 1e8,
    latencyMs: payload.latencyMs ?? null,
    stopReason: payload.stopReason ?? null,
    maxOutputTokens: ctx.maxOutputTokens ?? null,
    script: ctx.script ?? null,
    route: ctx.route ?? null,
    ownerUid: ctx.userId ?? null,
    cacheHit: ctx.cacheHit ?? null,
  });
}

/**
 * Roll up invocations by feature for a UTC date prefix.
 * @param {string} datePrefix YYYY-MM-DD
 * @param {string} [rootDir]
 */
export function readLlmTelemetryForDate(datePrefix, rootDir) {
  const path = resolveLlmInvocationsPath(rootDir);
  const byFeature = {};
  let totalUsd = 0;
  let count = 0;

  for (const row of readJsonlRecords(path)) {
    if (!row.timestamp?.startsWith(datePrefix)) continue;
    const feature = row.feature ?? 'unknown';
    byFeature[feature] = (byFeature[feature] ?? 0) + (row.costUsd ?? 0);
    totalUsd += row.costUsd ?? 0;
    count += 1;
  }

  return {
    total_usd: Math.round(totalUsd * 1e6) / 1e6,
    invocation_count: count,
    by_feature: Object.fromEntries(
      Object.entries(byFeature).map(([k, v]) => [k, Math.round(v * 1e6) / 1e6]),
    ),
  };
}
