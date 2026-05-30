/**
 * Cross-cutting LLM cost tracking: pricing, per-run caps, JSONL log, daily budget.
 * All business modules that spend on APIs should import from here.
 */

import { readTodayCostSpend, resolveCostLogPath } from '../../log/index.js';
import { existsSync } from 'node:fs';

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

// ─── Daily budget check ────────────────────────────────────────────────────

/**
 * Read today's cost log and abort if the daily budget is exceeded.
 * Call this at the start of any script before incurring API costs.
 */
export function checkDailyBudget() {
  const dailyBudget = Number.parseFloat(process.env.DAILY_BUDGET_USD ?? '10.00');
  const logPath = resolveCostLogPath();
  if (!existsSync(logPath)) return;

  let todaySpend;
  try {
    todaySpend = readTodayCostSpend();
  } catch (err) {
    console.error(`⚠ Could not read cost log: ${err.message}`);
    return;
  }

  if (todaySpend >= dailyBudget) {
    console.error(`\n🛑  Daily budget $${dailyBudget} exceeded (today's spend: $${todaySpend.toFixed(4)}) — terminating.`);
    console.error(`    Set DAILY_BUDGET_USD to raise the limit, or clear the cost log under cross-cut-modules/log/data/ to reset.`);
    process.exit(1);
  }

  if (todaySpend > 0) {
    console.error(`  📊 Today's spend so far: $${todaySpend.toFixed(4)} / $${dailyBudget} daily budget`);
  }
}
