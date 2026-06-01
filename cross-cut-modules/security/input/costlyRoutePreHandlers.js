import { httpDailyBudgetPreHandler } from '../../budget/app/httpDailyBudget.js';

/**
 * Compose preHandlers for costly LLM/OSINT routes: auth (incl. App Check when global) → daily budget.
 * App Check is applied in buildAuthHook when APP_CHECK_ENFORCE=true — do not duplicate here.
 * @param {import('fastify').preHandlerHookHandler[]} authHooks
 */
export function costlyRoutePreHandlers(authHooks = []) {
  const chain = [...authHooks];
  chain.push(httpDailyBudgetPreHandler);
  return { preHandler: chain };
}
