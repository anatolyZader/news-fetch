import { resolveCostLogPath } from '../infrastructure/logPaths.js';
import {
  appendRotatedJsonl,
  readRotatedJsonlForDate,
  readRotatedJsonlRecords,
} from '../infrastructure/rotatingJsonl.js';
import { getCostSpendTracker, spendTrackerEnabled } from '../infrastructure/costSpendTracker.js';

function costLogLookbackDays() {
  const n = Number.parseInt(process.env.COST_LOG_RUNID_LOOKBACK_DAYS ?? '14', 10);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

/**
 * @param {Array<{ model?: string, cost?: number }>} usageLog
 */
function breakdownFromUsageLog(usageLog) {
  let haiku = 0;
  let sonnet = 0;
  let opus = 0;
  let other = 0;
  for (const e of usageLog) {
    const m = e.model ?? '';
    const cost = e.cost ?? 0;
    if (m.includes('haiku')) haiku += cost;
    else if (m.includes('sonnet')) sonnet += cost;
    else if (m.includes('opus')) opus += cost;
    else other += cost;
  }
  return { haiku, sonnet, opus, other };
}

/**
 * @param {Array<{ stage?: string, stats?: object }>} stageEvents
 */
export function summariseStageEvents(stageEvents = []) {
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
 * @param {object} entry
 * @param {string} entry.script
 * @param {string} entry.date
 * @param {number} entry.totalCostUsd
 * @param {Array} entry.usageLog
 * @param {Array} [entry.stageEvents]
 * @param {number} [entry.articles]
 * @param {string} [entry.pipelineRunId]
 * @param {string} [entry.owner_uid]  Request owner for per-user budget attribution
 * @param {string} [entry.route]
 */
export function appendCostLog({ script, date, totalCostUsd, usageLog, stageEvents, articles, pipelineRunId, owner_uid: ownerUid, route }) {
  const { haiku, sonnet, opus, other } = breakdownFromUsageLog(usageLog ?? []);
  const runId = pipelineRunId ?? process.env.PIPELINE_RUN_ID?.trim() ?? null;

  const record = {
    timestamp: new Date().toISOString(),
    script,
    date,
    totalCostUsd,
    breakdown: { haiku, sonnet, opus, other },
  };
  if (ownerUid) {
    record.owner_uid = ownerUid;
  }
  if (route) {
    record.route = route;
  }
  if (runId) {
    record.pipelineRunId = runId;
  }
  if (articles != null) {
    record.articles = articles;
  }
  if (Array.isArray(stageEvents) && stageEvents.length > 0) {
    record.stages = summariseStageEvents(stageEvents);
  }

  try {
    appendRotatedJsonl(resolveCostLogPath(), record);
  } catch (err) {
    console.error(`⚠ Could not write cost log: ${err.message}`);
  }
}

/**
 * @param {string} logPath
 * @param {string} date YYYY-MM-DD
 */
export function readCostForDate(logPath, date) {
  const byScript = {};
  const entries = [];

  // Rows for a report date can be appended on other days (replays), so scan
  // the lookback window rather than only that date's file.
  for (const entry of readRotatedJsonlRecords(logPath, { days: costLogLookbackDays() })) {
    if (entry.date !== date) continue;
    entries.push(entry);
    byScript[entry.script] = (byScript[entry.script] ?? 0) + (entry.totalCostUsd ?? 0);
  }

  const total_usd = Object.values(byScript).reduce((a, b) => a + b, 0);
  return {
    total_usd: Math.round(total_usd * 10000) / 10000,
    by_script: byScript,
    entries,
  };
}

/**
 * @param {string} logPath
 * @param {string} pipelineRunId
 */
export function readCostForRunId(logPath, pipelineRunId) {
  const byScript = {};
  const entries = [];

  for (const entry of readRotatedJsonlRecords(logPath, { days: costLogLookbackDays() })) {
    if (entry.pipelineRunId !== pipelineRunId) continue;
    entries.push(entry);
    byScript[entry.script] = (byScript[entry.script] ?? 0) + (entry.totalCostUsd ?? 0);
  }

  const total_usd = Object.values(byScript).reduce((a, b) => a + b, 0);
  return {
    total_usd: Math.round(total_usd * 10000) / 10000,
    by_script: byScript,
    entries,
  };
}

/**
 * @param {string} logPath
 * @param {string} date
 * @param {{ scripts?: string[] }} [opts]
 */
export function readStageTelemetryForDate(logPath, date, opts = {}) {
  const want = opts.scripts?.length ? new Set(opts.scripts) : null;
  const latest = {};
  for (const entry of readRotatedJsonlRecords(logPath, { days: costLogLookbackDays() })) {
    if (entry.date !== date || !entry.script) continue;
    if (want && !want.has(entry.script)) continue;
    if (!entry.stages) continue;
    latest[entry.script] = entry.stages;
  }
  return latest;
}

/**
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {Record<string, number> | null}
 */
export function readCostBreakdownForDate(date, rootDir) {
  const logPath = resolveCostLogPath(rootDir);
  const { by_script: byScript } = readCostForDate(logPath, date);
  return Object.keys(byScript).length > 0 ? byScript : null;
}

/**
 * @param {string} date YYYY-MM-DD
 * @param {{ scripts?: string[] }} [opts]
 * @param {string} [rootDir]
 */
export function readCostLogStagesForDate(date, opts = {}, rootDir) {
  return readStageTelemetryForDate(resolveCostLogPath(rootDir), date, opts);
}

/**
 * Roll up drop rates across scripts for analyst display.
 * @param {Record<string, object>} byScript
 */
export function summarizeStageDropRates(byScript) {
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

/**
 * @param {string} [rootDir]
 * @returns {number} Spend for today (UTC date) from cost log
 */
export function readTodayCostSpend(rootDir) {
  if (spendTrackerEnabled()) {
    return getCostSpendTracker().todaySpendTotal(rootDir);
  }
  const today = new Date().toISOString().slice(0, 10);
  let todaySpend = 0;
  for (const entry of readRotatedJsonlForDate(resolveCostLogPath(rootDir), today)) {
    if (entry.timestamp?.startsWith(today)) {
      todaySpend += entry.totalCostUsd ?? 0;
    }
  }
  return todaySpend;
}

/**
 * Today's spend attributed to one request owner (cost-log rows carry `owner_uid`).
 * @param {string} ownerUid
 * @param {string} [rootDir]
 * @returns {number}
 */
export function readTodayCostSpendForOwner(ownerUid, rootDir) {
  if (!ownerUid) return 0;
  if (spendTrackerEnabled()) {
    return getCostSpendTracker().todaySpendForOwner(ownerUid, rootDir);
  }
  const today = new Date().toISOString().slice(0, 10);
  let total = 0;
  for (const entry of readRotatedJsonlForDate(resolveCostLogPath(rootDir), today)) {
    if (!entry.timestamp?.startsWith(today)) continue;
    if (entry.owner_uid !== ownerUid) continue;
    total += entry.totalCostUsd ?? 0;
  }
  return total;
}

/**
 * @param {string[]} scripts
 * @param {string} [rootDir]
 * @returns {number}
 */
export function readTodayCostSpendForScripts(scripts, rootDir) {
  if (spendTrackerEnabled()) {
    return getCostSpendTracker().todaySpendForScripts(scripts, rootDir);
  }
  const want = new Set(scripts);
  const today = new Date().toISOString().slice(0, 10);
  let total = 0;
  for (const entry of readRotatedJsonlForDate(resolveCostLogPath(rootDir), today)) {
    if (!entry.timestamp?.startsWith(today)) continue;
    if (!want.has(entry.script)) continue;
    total += entry.totalCostUsd ?? 0;
  }
  return total;
}
