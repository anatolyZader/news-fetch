/**
 * HITL-gated crisis chat budget pool (chat-only extra allowance).
 */
import { getDailyBudgetStatus } from '../app/httpDailyBudget.js';
import { readTodayCostSpendForScripts } from '../../log/index.js';

export function crisisBudgetEnabled(env = process.env) {
  return env.CRISIS_BUDGET_ENABLED !== '0';
}

export function crisisBudgetUsd(env = process.env) {
  const n = Number.parseFloat(env.CRISIS_BUDGET_USD ?? '50');
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export function crisisBudgetDefaultHours(env = process.env) {
  const n = Number.parseInt(env.CRISIS_BUDGET_DEFAULT_HOURS ?? '4', 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

function getCrisisChatSpend() {
  return readTodayCostSpendForScripts(['http:chat:crisis']);
}

/**
 * @param {{ adapter?: { getActiveSession?: Function } | null }} deps
 */
export function createCrisisBudgetService(deps = {}) {
  const adapter = deps.adapter ?? null;

  function getActiveSession() {
    if (!crisisBudgetEnabled() || !adapter?.getActiveSession) return null;
    return adapter.getActiveSession();
  }

  function getChatBudgetStatus() {
    const daily = getDailyBudgetStatus();
    const session = getActiveSession();
    const crisisSpent = getCrisisChatSpend();
    const crisisLimit = session?.pool_limit_usd ?? crisisBudgetUsd();

    if (session?.active) {
      return {
        mode: 'crisis',
        daily_exceeded: daily.exceeded,
        crisis_active: true,
        crisis_exceeded: crisisSpent >= crisisLimit,
        crisis_spent: crisisSpent,
        crisis_limit: crisisLimit,
        session,
        spent: daily.spent,
        limit: daily.limit,
      };
    }

    return {
      mode: 'normal',
      daily_exceeded: daily.exceeded,
      crisis_active: false,
      crisis_exceeded: false,
      crisis_spent: crisisSpent,
      crisis_limit: crisisBudgetUsd(),
      session: null,
      spent: daily.spent,
      limit: daily.limit,
    };
  }

  function activate({ activatedBy, reason, durationHours }) {
    if (!adapter?.activate) throw new Error('crisis_budget_not_configured');
    const hours = durationHours ?? crisisBudgetDefaultHours();
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    return adapter.activate({
      activatedBy,
      expiresAt,
      poolLimitUsd: crisisBudgetUsd(),
      reason: String(reason ?? ''),
    });
  }

  function deactivate() {
    if (!adapter?.deactivate) throw new Error('crisis_budget_not_configured');
    return adapter.deactivate();
  }

  /**
   * @param {object|null|undefined} assessment
   */
  function shouldSuggestCrisisBudget(assessment) {
    if (!crisisBudgetEnabled()) return false;
    const status = getChatBudgetStatus();
    if (!status.daily_exceeded && !status.crisis_exceeded) return false;
    if (status.crisis_active && !status.crisis_exceeded) return false;

    const dataVoid = assessment?.data_void ?? null;
    const epistemic = assessment?.epistemic_status ?? null;
    const voidLevel = dataVoid?.level ?? 'none';
    const sampling = epistemic?.sampling_status ?? 'normal';

    return voidLevel === 'critical'
      || dataVoid?.digital_darkness === true
      || sampling === 'blind'
      || epistemic?.assessment_mode === 'abstained';
  }

  return {
    getActiveSession,
    getChatBudgetStatus,
    getCrisisChatSpend,
    activate,
    deactivate,
    shouldSuggestCrisisBudget,
  };
}

/**
 * Resolve chat route budget gate outcome.
 * @param {{ crisisBudgetService?: ReturnType<typeof createCrisisBudgetService> | null }} deps
 */
export function resolveChatBudgetGate(deps = {}) {
  const service = deps.crisisBudgetService ?? null;
  const daily = getDailyBudgetStatus();
  const chatStatus = service?.getChatBudgetStatus?.() ?? {
    mode: 'normal',
    daily_exceeded: daily.exceeded,
    spent: daily.spent,
    limit: daily.limit,
  };

  if (!daily.exceeded) {
    return { allowLlm: true, budgetDegraded: false, useCrisisChatBudget: false, chatStatus };
  }

  if (chatStatus.crisis_active && !chatStatus.crisis_exceeded) {
    return { allowLlm: true, budgetDegraded: false, useCrisisChatBudget: true, chatStatus };
  }

  if (process.env.CHAT_DETERMINISTIC_FALLBACK !== '0') {
    return { allowLlm: false, budgetDegraded: true, useCrisisChatBudget: false, chatStatus };
  }

  return { allowLlm: false, budgetDegraded: false, useCrisisChatBudget: false, chatStatus, reject429: true };
}
