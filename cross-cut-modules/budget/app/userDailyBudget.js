/**
 * Per-user renewable daily chat budget (resets at UTC midnight, like the global pot).
 * Spend is attributed via `owner_uid` on cost-log rows.
 */

import { readTodayCostSpendForOwner } from '../../log/index.js';
import { canViewDeveloperDisplay } from '../../auth/userAccess.js';

const DEFAULT_USER_DAILY_BUDGET_USD = 5;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number} configured per-user daily limit; 0 disables metering
 */
export function userDailyBudgetLimitUsd(env = process.env) {
  const raw = env.CHAT_USER_DAILY_BUDGET_USD;
  if (raw == null || String(raw).trim() === '') return DEFAULT_USER_DAILY_BUDGET_USD;
  const limit = Number.parseFloat(raw);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return limit;
}

/**
 * Developer/maintainer accounts (the user's own) are unmetered; users are metered.
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function isUserBudgetExempt(email) {
  return canViewDeveloperDisplay(email);
}

/** @returns {string} ISO timestamp of the next UTC midnight (when the budget renews) */
export function nextUtcMidnightIso() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString();
}

/**
 * @param {string | null | undefined} uid
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ metered: boolean, exceeded: boolean, spent: number, limit: number, resetsAtUtc: string }}
 */
export function getUserDailyBudgetStatus(uid, env = process.env) {
  const limit = userDailyBudgetLimitUsd(env);
  const resetsAtUtc = nextUtcMidnightIso();
  if (limit <= 0 || !uid) {
    return { metered: false, exceeded: false, spent: 0, limit: 0, resetsAtUtc };
  }
  let spent;
  try {
    spent = readTodayCostSpendForOwner(uid);
  } catch {
    spent = 0;
  }
  return {
    metered: true,
    exceeded: spent >= limit,
    spent,
    limit,
    resetsAtUtc,
  };
}
