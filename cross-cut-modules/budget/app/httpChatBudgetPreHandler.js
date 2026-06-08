/**
 * Chat-only budget preHandler with crisis pool + deterministic fallback.
 */
import { chatDeterministicFallbackEnabled } from '../../../business_modules/chat/domain/chatDeterministicFallbackConfig.js';
import { resolveChatBudgetGate } from './crisisBudgetService.js';

/**
 * @param {{ crisisBudgetService?: object|null }} [deps]
 */
export function createHttpChatBudgetPreHandler(deps = {}) {
  const crisisBudgetService = deps.crisisBudgetService ?? null;

  return async function httpChatBudgetPreHandler(request, reply) {
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
      const status = gate.chatStatus?.limit != null
        ? gate.chatStatus
        : { ...daily, daily_exceeded: daily.exceeded };
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
