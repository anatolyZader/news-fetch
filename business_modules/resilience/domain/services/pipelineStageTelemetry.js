/**
 * Aggregate C9 stage events from in-memory runs and cost-log.jsonl.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function costLogPath() {
  return resolve(process.env.COST_LOG_PATH ?? 'cost-log.jsonl');
}

/**
 * @param {Array<{ stage?: string, stats?: object }>} stageEvents
 */
export function summarizeStageEvents(stageEvents = []) {
  const perStage = {};
  const totals = { kept: 0, dropped: 0, input: 0 };
  for (const ev of stageEvents) {
    const stage = ev.stage ?? 'unknown';
    const stats = ev.stats ?? {};
    if (!perStage[stage]) {
      perStage[stage] = { kept: 0, dropped: 0, input: 0, reason_counts: {} };
    }
    const bucket = perStage[stage];
    bucket.kept += stats.kept ?? 0;
    bucket.dropped += stats.dropped ?? 0;
    bucket.input += stats.input ?? 0;
    for (const [reason, count] of Object.entries(stats.reason_counts ?? {})) {
      bucket.reason_counts[reason] = (bucket.reason_counts[reason] || 0) + count;
    }
    totals.kept += stats.kept ?? 0;
    totals.dropped += stats.dropped ?? 0;
    totals.input += stats.input ?? 0;
  }
  return { perStage, totals };
}

/**
 * Latest cost-log entry per script for a given report date.
 * @param {string} date YYYY-MM-DD
 * @param {{ scripts?: string[] }} [opts]
 */
export function readCostLogStagesForDate(date, { scripts } = {}) {
  const logPath = costLogPath();
  if (!existsSync(logPath)) return {};
  const want = scripts?.length ? new Set(scripts) : null;
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
 * Operator-safe rollup (no reason_counts detail).
 * @param {{ assess?: object, extract?: object }} blocks
 */
export function extractionTelemetryForOperator(blocks) {
  const out = {};
  for (const [key, val] of Object.entries(blocks ?? {})) {
    if (!val || typeof val !== 'object') continue;
    out[key] = {
      totals: val.totals,
      per_stage: val.perStage
        ? Object.fromEntries(
          Object.entries(val.perStage).map(([stage, s]) => [
            stage,
            { kept: s.kept, dropped: s.dropped, input: s.input },
          ]),
        )
        : undefined,
    };
  }
  return out;
}
