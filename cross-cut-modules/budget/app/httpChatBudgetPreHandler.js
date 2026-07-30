/**
 * Chat-only budget preHandler with crisis pool + deterministic fallback.
 */
import { chatDeterministicFallbackEnabled } from '../../../business_modules/chat/index.js';
import { getDailyBudgetStatus } from './httpDailyBudget.js';
import { getUserDailyBudgetStatus, isUserBudgetExempt } from './userDailyBudget.js';
import { resolveChatBudgetGate } from './crisisBudgetService.js';

/**
 * @param {{ crisisBudgetService?: object|null }} [deps]
 */
export function createHttpChatBudgetPreHandler(deps = {}) {
  const crisisBudgetService = deps.crisisBudgetService ?? null;

  return async function httpChatBudgetPreHandler(request, reply) {
    if (!isUserBudgetExempt(request.user?.email)) {
      const userStatus = getUserDailyBudgetStatus(request.user?.uid);
      request.userBudgetStatus = userStatus;
      if (userStatus.metered && userStatus.exceeded) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          code: 'user_budget_exceeded',
          message: `Your daily chat budget $${userStatus.limit.toFixed(2)} is used up — it renews at 00:00 UTC (~02:00 Israel time)`,
          spent: userStatus.spent,
          limit: userStatus.limit,
          resets_at: userStatus.resetsAtUtc,
        });
      }
    }

    const gate = resolveChatBudgetGate({ crisisBudgetService });
    request.chatBudgetStatus = gate.chatStatus;

    if (gate.allowLlm) {
      request.budgetDegraded = false;
      request.useCrisisChatBudget = gate.useCrisisChatBudget === true;
      return;
    }

    if (gate.budgetDegraded && chatDeterministicFallbackEnabled()) {
      request.budgetDegraded = true;
      request.useCrisisChatBudget = false;
      return;
    }

    if (gate.reject429) {
      const fallbackDaily = getDailyBudgetStatus();
      const status = gate.chatStatus?.limit == null
        ? { spent: fallbackDaily.spent, limit: fallbackDaily.limit, daily_exceeded: fallbackDaily.exceeded }
        : gate.chatStatus;
      return reply.code(429).send({
        error: 'Too Many Requests',
        code: 'daily_budget_exceeded',
        message: `Daily API budget $${status.limit.toFixed(2)} exceeded (spent: $${status.spent.toFixed(4)})`,
        spent: status.spent,
        limit: status.limit,
        suggest_crisis_budget: crisisBudgetService?.shouldSuggestCrisisBudget?.() ?? false,
      });
    }

    request.budgetDegraded = false;
    request.useCrisisChatBudget = false;
  };
}

/** @deprecated use createHttpChatBudgetPreHandler factory */
export async function httpChatBudgetPreHandler(request, reply) {
  return createHttpChatBudgetPreHandler()(request, reply);
}
