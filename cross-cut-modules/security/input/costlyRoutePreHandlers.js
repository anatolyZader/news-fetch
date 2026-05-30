import { appCheckPreHandler } from './appCheckPreHandler.js';
import { httpDailyBudgetPreHandler } from '../../budget/app/httpDailyBudget.js';

/**
 * Compose preHandlers for costly LLM/OSINT routes: auth → App Check → daily budget.
 * @param {import('fastify').preHandlerHookHandler[]} authHooks
 */
export function costlyRoutePreHandlers(authHooks = []) {
  const chain = [...authHooks];
  if (process.env.APP_CHECK_ENFORCE === 'true') {
    chain.push(appCheckPreHandler);
  }
  chain.push(httpDailyBudgetPreHandler);
  return { preHandler: chain };
}
