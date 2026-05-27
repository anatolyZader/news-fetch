/**
 * Cross-cutting LLM cost tracking: pricing, per-run caps, JSONL log, daily budget.
 * All business modules that spend on APIs should import from here.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Pricing ($/1M tokens) ─────────────────────────────────────────────────

export const PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.8,  output: 4  },
  'claude-sonnet-4-6':         { input: 3,  output: 15 },
  'claude-opus-4-6':           { input: 15, output: 75 },
};

/** USD per minute of input audio (OpenAI speech-to-text; API does not return token usage on all formats). */
export const TRANSCRIPTION_USD_PER_MINUTE = {
  'gpt-4o-transcribe-diarize': 0.006,
  'whisper-1': 0.006,
};

/**
 * Estimate transcription cost from audio duration (used when logging audio ingest).
 * @param {string} model
 * @param {number} durationSeconds
 * @returns {number}
 */
export function calcTranscriptionCostUsd(model, durationSeconds) {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const perMin = TRANSCRIPTION_USD_PER_MINUTE[model];
  if (perMin == null) return 0;
  return (durationSeconds / 60) * perMin;
}

function isClaudeHaikuModel(model) {
  return typeof model === 'string' && model.includes('haiku');
}
function isClaudeSonnetModel(model) {
  return typeof model === 'string' && model.includes('sonnet');
}
function isClaudeOpusModel(model) {
  return typeof model === 'string' && model.includes('opus');
}

function breakdownFromUsageLog(usageLog) {
  let haiku = 0;
  let sonnet = 0;
  let opus = 0;
  let other = 0;
  for (const e of usageLog) {
    const m = e.model ?? '';
    if (isClaudeHaikuModel(m)) haiku += e.cost;
    else if (isClaudeSonnetModel(m)) sonnet += e.cost;
    else if (isClaudeOpusModel(m)) opus += e.cost;
    else other += e.cost;
  }
  return { haiku, sonnet, opus, other };
}

/**
 * @param {string} model
 * @param {{ input_tokens?: number, output_tokens?: number }} [usage]
 * @returns {number}
 */
export function calcInvocationCostUsd(model, usage) {
  if (!usage || typeof usage.input_tokens !== 'number' || typeof usage.output_tokens !== 'number') {
    return 0;
  }
  const p = PRICING[model];
  if (!p) return 0;
  return (usage.input_tokens / 1_000_000) * p.input + (usage.output_tokens / 1_000_000) * p.output;
}

// ─── Per-run cost tracker ──────────────────────────────────────────────────

/**
 * Create a cost tracker for a single script run.
 *
 * @param {object} opts
 * @param {number} [opts.maxCostUsd]   Per-run cap in USD (default: MAX_COST_USD env or 3)
 * @param {string} [opts.label]        Human-readable label for log messages
 * @returns {{ onUsage, getTotal, printSummary }}
 */
export function createCostTracker({ maxCostUsd, label: _label = 'run' } = {}) {
  const cap = maxCostUsd ?? Number.parseFloat(process.env.MAX_COST_USD ?? '3');
  const usageLog = [];
  // C9 — stage instrumentation: stage events (verifier kills, self-check
  // verdicts) carry no LLM cost but are aggregated into the persistent log so
  // we can later answer "is the self-check earning its tokens?" without needing
  // to re-derive it from raw transcripts.
  const stageEvents = [];
  let totalCostUsd = 0;

  /**
   * @param {{
   *   label: string,
   *   model?: string,
   *   usage?: { input_tokens?: number, output_tokens?: number },
   *   costUsd?: number,
   *   stage?: string,
   *   stats?: { kept?: number, dropped?: number, input?: number, reason_counts?: Record<string, number> }
   * }} payload
   */
  function onUsage(payload) {
    const { label: callLabel, model, usage, costUsd, stage, stats } = payload;

    if (stage) {
      stageEvents.push({ label: callLabel, stage, stats: stats ?? {} });
      const dropped = stats?.dropped ?? 0;
      const input = stats?.input ?? 0;
      console.error(`  🔎 ${callLabel.padEnd(38)} stage=${stage}  dropped: ${dropped}/${input}`);
      return;
    }

    let cost;
    if (typeof costUsd === 'number' && Number.isFinite(costUsd)) {
      cost = Math.max(0, costUsd);
    } else {
      if (!usage) return;
      cost = calcInvocationCostUsd(model, usage);
    }
    totalCostUsd += cost;
    usageLog.push({
      label: callLabel,
      model,
      usage: usage ?? { input_tokens: 0, output_tokens: 0 },
      cost,
    });
    if (typeof costUsd === 'number' && Number.isFinite(costUsd)) {
      console.error(`  💰 ${callLabel.padEnd(38)} (est. audio)  $${cost.toFixed(4)}`);
    } else {
      console.error(
        `  💰 ${callLabel.padEnd(38)} in: ${String(usage.input_tokens).padStart(6)}  out: ${String(usage.output_tokens).padStart(6)}  $${cost.toFixed(4)}`,
      );
    }
    if (totalCostUsd > cap) {
      console.error(`\n🛑  Cost cap $${cap} exceeded (running total: $${totalCostUsd.toFixed(4)}) — terminating.`);
      printSummary();
      process.exit(1);
    }
  }

  function getStageEvents() {
    return stageEvents;
  }

  function getTotal() {
    return { totalCostUsd, usageLog, stageEvents };
  }

  function printSummary() {
    const { haiku: haikuCost, sonnet: sonnetCost, opus: opusCost, other: otherCost } = breakdownFromUsageLog(usageLog);
    console.error(
      `💰 Total cost: $${totalCostUsd.toFixed(4)}  (Haiku: $${haikuCost.toFixed(4)}  |  Sonnet: $${sonnetCost.toFixed(4)}  |  Opus: $${opusCost.toFixed(4)}  |  Other: $${otherCost.toFixed(4)})`,
    );
  }

  return { onUsage, getTotal, getStageEvents, printSummary };
}

// ─── Persistent cost log ───────────────────────────────────────────────────

function costLogPath() {
  return resolve(process.env.COST_LOG_PATH ?? 'cost-log.jsonl');
}

/**
 * Aggregate C9 stage events (verifier / self-check / etc.) into a compact
 * per-stage summary suitable for the persistent log. Returns { perStage,
 * totals } shaped like:
 *   { perStage: { evidence_verifier: { kept, dropped, input, reason_counts } },
 *     totals:   { kept, dropped, input } }
 */
function summariseStageEvents(stageEvents = []) {
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
 * Append one run entry to cost-log.jsonl (JSONL format, one JSON object per line).
 *
 * @param {object} entry
 * @param {string} entry.script        Script name (e.g. 'extract-signals')
 * @param {string} entry.date          Report/article date (YYYY-MM-DD)
 * @param {number} entry.totalCostUsd
 * @param {Array}  entry.usageLog      Raw usage entries from createCostTracker
 * @param {Array}  [entry.stageEvents] C9 stage events from createCostTracker
 * @param {number} [entry.articles]    Article count processed
 */
export function appendCostLog({ script, date, totalCostUsd, usageLog, stageEvents, articles }) {
  const { haiku: haikuCost, sonnet: sonnetCost, opus: opusCost, other: otherCost } = breakdownFromUsageLog(usageLog);

  const record = {
    timestamp: new Date().toISOString(),
    script,
    date,
    totalCostUsd,
    breakdown: { haiku: haikuCost, sonnet: sonnetCost, opus: opusCost, other: otherCost },
  };
  if (articles != null) {
    record.articles = articles;
  }

  if (Array.isArray(stageEvents) && stageEvents.length > 0) {
    record.stages = summariseStageEvents(stageEvents);
  }

  try {
    appendFileSync(costLogPath(), JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    console.error(`⚠ Could not write cost log: ${err.message}`);
  }
}

// ─── Daily budget check ────────────────────────────────────────────────────

/**
 * Read today's cost-log.jsonl entries and abort if the daily budget is exceeded.
 * Call this at the start of any script before incurring API costs.
 */
export function checkDailyBudget() {
  const dailyBudget = Number.parseFloat(process.env.DAILY_BUDGET_USD ?? '10.00');
  const logPath = costLogPath();
  if (!existsSync(logPath)) return;

  const today = new Date().toISOString().slice(0, 10);
  let todaySpend = 0;

  try {
    const lines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.timestamp?.startsWith(today)) {
          todaySpend += entry.totalCostUsd ?? 0;
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch (err) {
    console.error(`⚠ Could not read cost log: ${err.message}`);
    return;
  }

  if (todaySpend >= dailyBudget) {
    console.error(`\n🛑  Daily budget $${dailyBudget} exceeded (today's spend: $${todaySpend.toFixed(4)}) — terminating.`);
    console.error(`    Set DAILY_BUDGET_USD to raise the limit, or clear cost-log.jsonl to reset.`);
    process.exit(1);
  }

  if (todaySpend > 0) {
    console.error(`  📊 Today's spend so far: $${todaySpend.toFixed(4)} / $${dailyBudget} daily budget`);
  }
}
