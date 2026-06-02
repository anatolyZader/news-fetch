/**
 * HTTP-friendly daily budget check (no process.exit).
 */

import { readTodayCostSpend } from '../../log/index.js';

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ exceeded: boolean, spent: number, limit: number }}
 */
export function getDailyBudgetStatus(env = process.env) {
  const limit = Number.parseFloat(env.DAILY_BUDGET_USD ?? '10.00');
  const dailyBudget = Number.isFinite(limit) && limit > 0 ? limit : 10;
  let spent;
  try {
    spent = readTodayCostSpend();
  } catch {
    spent = 0;
  }
  return {
    exceeded: spent >= dailyBudget,
    spent,
    limit: dailyBudget,
  };
}

/**
 * Fastify preHandler: reject costly API work when daily LLM budget is exhausted.
 */
export async function httpDailyBudgetPreHandler(request, reply) {
  const status = getDailyBudgetStatus();
  if (!status.exceeded) {
    return;
  }
  return reply.code(429).send({
    error: 'Too Many Requests',
    code: 'daily_budget_exceeded',
    message: `Daily API budget $${status.limit.toFixed(2)} exceeded (spent: $${status.spent.toFixed(4)})`,
    spent: status.spent,
    limit: status.limit,
  });
}

/** @deprecated use getDailyBudgetStatus — kept for scripts */
export function checkDailyBudgetForHttp() {
  return getDailyBudgetStatus();
}
