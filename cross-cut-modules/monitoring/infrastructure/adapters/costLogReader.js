import { existsSync, readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

/**
 * @param {string} rootDir
 * @returns {string}
 */
export function resolveCostLogPath(rootDir) {
  const env = process.env.COST_LOG_PATH?.trim();
  if (!env) return join(rootDir, 'cost-log.jsonl');
  return isAbsolute(env) ? env : join(rootDir, env);
}

/**
 * @param {string} logPath
 * @param {string} date YYYY-MM-DD
 */
export function readCostForDate(logPath, date) {
  if (!existsSync(logPath)) {
    return { total_usd: 0, by_script: {}, entries: [] };
  }

  const byScript = {};
  /** @type {Array<object>} */
  const entries = [];

  try {
    const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.date !== date) continue;
        entries.push(entry);
        byScript[entry.script] = (byScript[entry.script] ?? 0) + (entry.totalCostUsd ?? 0);
      } catch {
        /* skip */
      }
    }
  } catch {
    return { total_usd: 0, by_script: {}, entries: [] };
  }

  const total_usd = Object.values(byScript).reduce((a, b) => a + b, 0);
  return {
    total_usd: Math.round(total_usd * 10000) / 10000,
    by_script: byScript,
    entries,
  };
}

/**
 * Latest cost-log stage blocks per script for a date.
 * @param {string} logPath
 * @param {string} date
 * @param {{ scripts?: string[] }} [opts]
 */
export function readStageTelemetryForDate(logPath, date, opts = {}) {
  if (!existsSync(logPath)) return {};
  const want = opts.scripts?.length ? new Set(opts.scripts) : null;
  const latest = {};
  try {
    const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.date !== date || !entry.script) continue;
      if (want && !want.has(entry.script)) continue;
      if (!entry.stages) continue;
      latest[entry.script] = entry.stages;
    }
  } catch {
    return {};
  }
  return latest;
}

/**
 * Roll up drop rates across scripts for analyst display.
 * @param {Record<string, object>} byScript
 */
export function summarizeStageDropRates(byScript) {
  /** @type {Record<string, { kept: number, dropped: number, input: number }>} */
  const perStage = {};
  const totals = { kept: 0, dropped: 0, input: 0 };

  for (const block of Object.values(byScript ?? {})) {
    const stages = block?.perStage ?? block?.per_stage ?? {};
    for (const [stage, stats] of Object.entries(stages)) {
      if (!perStage[stage]) {
        perStage[stage] = { kept: 0, dropped: 0, input: 0 };
      }
      perStage[stage].kept += stats.kept ?? 0;
      perStage[stage].dropped += stats.dropped ?? 0;
      perStage[stage].input += stats.input ?? 0;
      totals.kept += stats.kept ?? 0;
      totals.dropped += stats.dropped ?? 0;
      totals.input += stats.input ?? 0;
    }
  }

  return { per_stage: perStage, totals };
}
