/**
 * Shared cost tracking, pricing, and persistent cost logging for the resilience pipeline.
 *
 * Exports:
 *   PRICING             — per-model input/output rates ($/1M tokens)
 *   createCostTracker   — per-run usage tracker with cap enforcement
 *   appendCostLog       — append one entry to cost-log.jsonl
 *   checkDailyBudget    — abort if today's spend exceeds DAILY_BUDGET_USD
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Pricing ($/1M tokens) ─────────────────────────────────────────────────

export const PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
};

// ─── Per-run cost tracker ──────────────────────────────────────────────────

/**
 * Create a cost tracker for a single script run.
 *
 * @param {object} opts
 * @param {number} opts.maxCostUsd   Per-run cap in USD (default: MAX_COST_USD env or 3.00)
 * @param {string} opts.label        Human-readable label for log messages
 * @returns {{ onUsage, getTotal, printSummary }}
 */
export function createCostTracker({ maxCostUsd, label = 'run' } = {}) {
  const cap = maxCostUsd ?? parseFloat(process.env.MAX_COST_USD ?? '3.00');
  const usageLog = [];
  let totalCostUsd = 0;

  function onUsage({ label: callLabel, model, usage }) {
    const p = PRICING[model];
    const cost = p
      ? (usage.input_tokens / 1_000_000) * p.input + (usage.output_tokens / 1_000_000) * p.output
      : 0;
    totalCostUsd += cost;
    usageLog.push({ label: callLabel, model, usage, cost });
    console.error(
      `  💰 ${callLabel.padEnd(38)} in: ${String(usage.input_tokens).padStart(6)}  out: ${String(usage.output_tokens).padStart(6)}  $${cost.toFixed(4)}`
    );
    if (totalCostUsd > cap) {
      console.error(`\n🛑  Cost cap $${cap} exceeded (running total: $${totalCostUsd.toFixed(4)}) — terminating.`);
      printSummary();
      process.exit(1);
    }
  }

  function getTotal() {
    return { totalCostUsd, usageLog };
  }

  function printSummary() {
    const haikuCost  = usageLog.filter(e => e.model.includes('haiku')).reduce((s, e) => s + e.cost, 0);
    const sonnetCost = usageLog.filter(e => e.model.includes('sonnet')).reduce((s, e) => s + e.cost, 0);
    const opusCost   = usageLog.filter(e => e.model.includes('opus')).reduce((s, e) => s + e.cost, 0);
    console.error(`💰 Total cost: $${totalCostUsd.toFixed(4)}  (Haiku: $${haikuCost.toFixed(4)}  |  Sonnet: $${sonnetCost.toFixed(4)}  |  Opus: $${opusCost.toFixed(4)})`);
  }

  return { onUsage, getTotal, printSummary };
}

// ─── Persistent cost log ───────────────────────────────────────────────────

function costLogPath() {
  return resolve(process.env.COST_LOG_PATH ?? 'cost-log.jsonl');
}

/**
 * Append one run entry to cost-log.jsonl (JSONL format, one JSON object per line).
 *
 * @param {object} entry
 * @param {string} entry.script        Script name (e.g. 'analyze-resilience')
 * @param {string} entry.date          Report/article date (YYYY-MM-DD)
 * @param {number} entry.totalCostUsd
 * @param {Array}  entry.usageLog      Raw usage entries from createCostTracker
 * @param {number} [entry.articles]    Article count processed
 */
export function appendCostLog({ script, date, totalCostUsd, usageLog, articles }) {
  const haikuCost  = usageLog.filter(e => e.model.includes('haiku')).reduce((s, e) => s + e.cost, 0);
  const sonnetCost = usageLog.filter(e => e.model.includes('sonnet')).reduce((s, e) => s + e.cost, 0);
  const opusCost   = usageLog.filter(e => e.model.includes('opus')).reduce((s, e) => s + e.cost, 0);

  const record = {
    timestamp: new Date().toISOString(),
    script,
    date,
    totalCostUsd,
    breakdown: { haiku: haikuCost, sonnet: sonnetCost, opus: opusCost },
    ...(articles != null ? { articles } : {}),
  };

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
  const dailyBudget = parseFloat(process.env.DAILY_BUDGET_USD ?? '10.00');
  const logPath = costLogPath();
  if (!existsSync(logPath)) return;

  const today = new Date().toISOString().slice(0, 10);
  let todaySpend = 0;

  try {
    const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
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
