/**
 * Post-pipeline token report — written after each full pipeline run.
 *
 * Reads llm-invocations.jsonl, filters entries within the run's time window,
 * and writes daily_reports/token-report-{date}-{scope}.json.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { readJsonlRecords } from '../log/infrastructure/jsonlLog.js';
import { resolveLlmInvocationsPath } from './llmInvocationLog.js';

/**
 * @param {object[]} rows
 * @param {string} groupKey  field name to group by (e.g. 'feature' or 'model')
 */
function groupRows(rows, groupKey) {
  const groups = {};
  for (const row of rows) {
    const key = row[groupKey] ?? 'unknown';
    if (!groups[key]) {
      groups[key] = { invocations: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationTokens: 0, costUsd: 0 };
    }
    const g = groups[key];
    g.invocations += 1;
    g.inputTokens += row.inputTokens ?? 0;
    g.outputTokens += row.outputTokens ?? 0;
    g.cachedInputTokens += row.cachedInputTokens ?? 0;
    g.cacheCreationTokens += row.cacheCreationTokens ?? 0;
    g.costUsd = Math.round((g.costUsd + (row.costUsd ?? 0)) * 1e8) / 1e8;
  }
  return groups;
}

/**
 * @param {{
 *   startedAt: string,      ISO timestamp before pipeline began
 *   completedAt: string,    ISO timestamp after pipeline ended
 *   date: string,           YYYY-MM-DD assessment date
 *   scope: string,          pipeline scope (national|north|…)
 *   days: number,
 *   reportsDir: string,     absolute path to daily_reports/
 *   rootDir?: string,
 * }} opts
 * @returns {string} path to written report file
 */
export function writeTokenReport({ startedAt, completedAt, date, scope, days, reportsDir, rootDir }) {
  const logPath = resolveLlmInvocationsPath(rootDir);
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(completedAt).getTime();

  const rows = readJsonlRecords(logPath).filter((row) => {
    if (!row.timestamp) return false;
    const t = new Date(row.timestamp).getTime();
    return t >= startMs && t <= endMs;
  });

  const totalInput = rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
  const totalOutput = rows.reduce((s, r) => s + (r.outputTokens ?? 0), 0);
  const totalCached = rows.reduce((s, r) => s + (r.cachedInputTokens ?? 0), 0);
  const totalCreation = rows.reduce((s, r) => s + (r.cacheCreationTokens ?? 0), 0);
  const totalCost = Math.round(rows.reduce((s, r) => s + (r.costUsd ?? 0), 0) * 1e8) / 1e8;
  const effectiveInput = totalInput - totalCached;
  const cacheHitRatePct = totalInput > 0 ? Math.round((totalCached / totalInput) * 1000) / 10 : 0;

  const calls = rows.map((r) => ({
    timestamp: r.timestamp,
    feature: r.feature ?? 'unknown',
    purpose: r.purpose ?? null,
    model: r.model ?? 'unknown',
    inputTokens: r.inputTokens ?? 0,
    outputTokens: r.outputTokens ?? 0,
    cachedInputTokens: r.cachedInputTokens ?? 0,
    cacheCreationTokens: r.cacheCreationTokens ?? 0,
    costUsd: r.costUsd ?? 0,
    latencyMs: r.latencyMs ?? null,
    stopReason: r.stopReason ?? null,
  }));

  const report = {
    date,
    scope,
    days,
    runStartedAt: startedAt,
    runCompletedAt: completedAt,
    durationMs: endMs - startMs,
    summary: {
      invocations: rows.length,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cachedInputTokens: totalCached,
      cacheCreationTokens: totalCreation,
      effectiveInputTokens: effectiveInput,
      cacheHitRatePct,
      costUsd: totalCost,
    },
    byFeature: groupRows(rows, 'feature'),
    byModel: groupRows(rows, 'model'),
    calls,
  };

  mkdirSync(reportsDir, { recursive: true });
  const filename = `token-report-${date}-${scope}.json`;
  const outPath = join(reportsDir, filename);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  return outPath;
}
