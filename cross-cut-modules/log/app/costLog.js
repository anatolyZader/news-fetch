import { resolveCostLogPath } from '../infrastructure/logPaths.js';
import { appendJsonlRecord, readJsonlRecords } from '../infrastructure/jsonlLog.js';

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
 */
export function appendCostLog({ script, date, totalCostUsd, usageLog, stageEvents, articles }) {
  const { haiku, sonnet, opus, other } = breakdownFromUsageLog(usageLog ?? []);

  const record = {
    timestamp: new Date().toISOString(),
    script,
    date,
    totalCostUsd,
    breakdown: { haiku, sonnet, opus, other },
  };
  if (articles != null) {
    record.articles = articles;
  }
  if (Array.isArray(stageEvents) && stageEvents.length > 0) {
    record.stages = summariseStageEvents(stageEvents);
  }

  try {
    appendJsonlRecord(resolveCostLogPath(), record);
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

  for (const entry of readJsonlRecords(logPath)) {
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
 * @param {string} date
 * @param {{ scripts?: string[] }} [opts]
 */
export function readStageTelemetryForDate(logPath, date, opts = {}) {
  const want = opts.scripts?.length ? new Set(opts.scripts) : null;
  const latest = {};
  for (const entry of readJsonlRecords(logPath)) {
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
  const today = new Date().toISOString().slice(0, 10);
  let todaySpend = 0;
  for (const entry of readJsonlRecords(resolveCostLogPath(rootDir))) {
    if (entry.timestamp?.startsWith(today)) {
      todaySpend += entry.totalCostUsd ?? 0;
    }
  }
  return todaySpend;
}

/**
 * @param {string[]} scripts
 * @param {string} [rootDir]
 * @returns {number}
 */
export function readTodayCostSpendForScripts(scripts, rootDir) {
  const want = new Set(scripts);
  const today = new Date().toISOString().slice(0, 10);
  let total = 0;
  for (const entry of readJsonlRecords(resolveCostLogPath(rootDir))) {
    if (!entry.timestamp?.startsWith(today)) continue;
    if (!want.has(entry.script)) continue;
    total += entry.totalCostUsd ?? 0;
  }
  return total;
}
