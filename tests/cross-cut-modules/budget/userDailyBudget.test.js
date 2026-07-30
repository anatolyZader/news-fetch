import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getUserDailyBudgetStatus,
  isUserBudgetExempt,
  userDailyBudgetLimitUsd,
} from '../../../cross-cut-modules/budget/app/userDailyBudget.js';
import { createHttpChatBudgetPreHandler } from '../../../cross-cut-modules/budget/app/httpChatBudgetPreHandler.js';
import { appendCostLog, readTodayCostSpendForOwner } from '../../../cross-cut-modules/log/index.js';
import {
  setUserAccessConfigForTests,
  resetUserAccessCache,
} from '../../../cross-cut-modules/auth/userAccess.js';

function ownerCostLine(ownerUid, totalCostUsd) {
  const timestamp = `${new Date().toISOString().slice(0, 10)}T10:00:00.000Z`;
  return `${JSON.stringify({ timestamp, owner_uid: ownerUid, totalCostUsd })}\n`;
}

function fakeReply() {
  return {
    code(c) { this.statusCode = c; return this; },
    send(payload) { this.payload = payload; return this; },
  };
}

describe('userDailyBudget', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = join(tmpdir(), `budget-user-${process.pid}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(rootDir, { recursive: true });
    process.env.COST_LOG_PATH = join(rootDir, 'cost-log.jsonl');
    resetUserAccessCache();
  });

  afterEach(() => {
    delete process.env.COST_LOG_PATH;
    delete process.env.CHAT_USER_DAILY_BUDGET_USD;
    delete process.env.CHAT_DETERMINISTIC_FALLBACK;
    resetUserAccessCache();
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('defaults the limit and honors override / disable', () => {
    assert.equal(userDailyBudgetLimitUsd({}), 5);
    assert.equal(userDailyBudgetLimitUsd({ CHAT_USER_DAILY_BUDGET_USD: '5.5' }), 5.5);
    assert.equal(userDailyBudgetLimitUsd({ CHAT_USER_DAILY_BUDGET_USD: '0' }), 0);
    assert.equal(userDailyBudgetLimitUsd({ CHAT_USER_DAILY_BUDGET_USD: 'nope' }), 0);
  });

  it('attributes spend per owner and only for today', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    writeFileSync(
      process.env.COST_LOG_PATH,
      ownerCostLine('u1', 1.5)
      + ownerCostLine('u2', 0.4)
      + `${JSON.stringify({ timestamp: yesterday, owner_uid: 'u1', totalCostUsd: 9 })}\n`,
    );
    assert.equal(readTodayCostSpendForOwner('u1'), 1.5);
    assert.equal(readTodayCostSpendForOwner('u2'), 0.4);
    assert.equal(readTodayCostSpendForOwner('nobody'), 0);
  });

  it('appendCostLog persists owner_uid (round-trip)', () => {
    appendCostLog({
      script: 'http:chat',
      date: new Date().toISOString().slice(0, 10),
      totalCostUsd: 0.25,
      usageLog: [],
      owner_uid: 'round-trip-uid',
      route: '/api/chat',
    });
    assert.equal(readTodayCostSpendForOwner('round-trip-uid'), 0.25);
  });

  it('reports exceeded once spend reaches the limit', () => {
    writeFileSync(process.env.COST_LOG_PATH, ownerCostLine('u1', 2.1));
    const status = getUserDailyBudgetStatus('u1', { CHAT_USER_DAILY_BUDGET_USD: '2' });
    assert.equal(status.metered, true);
    assert.equal(status.exceeded, true);
    assert.equal(status.spent, 2.1);
    assert.ok(status.resetsAtUtc.endsWith('T00:00:00.000Z'));
  });

  it('is unmetered when disabled or uid missing', () => {
    assert.deepEqual(getUserDailyBudgetStatus('u1', { CHAT_USER_DAILY_BUDGET_USD: '0' }).metered, false);
    assert.deepEqual(getUserDailyBudgetStatus(null, {}).metered, false);
  });

  it('exempts analyst and maintainer accounts, meters operators', () => {
    setUserAccessConfigForTests({
      operatorDistrictEnforcementEnabled: false,
      users: [
        { email: 'analyst@example.com', level: 'analyst' },
        { email: 'boss@example.com', level: 'maintainer' },
        { email: 'colleague@example.com', level: 'operator' },
      ],
    });
    assert.equal(isUserBudgetExempt('analyst@example.com'), true);
    assert.equal(isUserBudgetExempt('boss@example.com'), true);
    assert.equal(isUserBudgetExempt('colleague@example.com'), false);
  });

  it('preHandler 429s a metered user over their budget, with renewal info', async () => {
    setUserAccessConfigForTests({
      operatorDistrictEnforcementEnabled: false,
      users: [{ email: 'colleague@example.com', level: 'operator' }],
    });
    process.env.CHAT_USER_DAILY_BUDGET_USD = '1';
    writeFileSync(process.env.COST_LOG_PATH, ownerCostLine('op-1', 1.2));
    const request = { user: { uid: 'op-1', email: 'colleague@example.com' } };
    const reply = fakeReply();
    await createHttpChatBudgetPreHandler()(request, reply);
    assert.equal(reply.statusCode, 429);
    assert.equal(reply.payload.code, 'user_budget_exceeded');
    assert.equal(reply.payload.limit, 1);
    assert.ok(reply.payload.resets_at);
  });

  it('preHandler lets an exempt analyst through even with heavy personal spend', async () => {
    setUserAccessConfigForTests({
      operatorDistrictEnforcementEnabled: false,
      users: [{ email: 'analyst@example.com', level: 'analyst' }],
    });
    process.env.CHAT_USER_DAILY_BUDGET_USD = '1';
    writeFileSync(process.env.COST_LOG_PATH, ownerCostLine('an-1', 5));
    const request = { user: { uid: 'an-1', email: 'analyst@example.com' } };
    const reply = fakeReply();
    await createHttpChatBudgetPreHandler()(request, reply);
    assert.equal(reply.statusCode, undefined);
    assert.equal(request.budgetDegraded, false);
  });
});
