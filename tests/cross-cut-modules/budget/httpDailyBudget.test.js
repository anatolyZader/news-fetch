import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDailyBudgetStatus } from '../../../cross-cut-modules/budget/app/httpDailyBudget.js';
import { httpChatBudgetPreHandler } from '../../../cross-cut-modules/budget/app/httpChatBudgetPreHandler.js';

function costLogLine(totalCostUsd) {
  const day = new Date().toISOString().slice(0, 10);
  return JSON.stringify({ timestamp: day + 'T12:00:00.000Z', totalCostUsd }) + '\n';
}

describe('httpDailyBudget', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = join(tmpdir(), `budget-http-${Date.now()}`);
    mkdirSync(rootDir, { recursive: true });
    process.env.COST_LOG_PATH = join(rootDir, 'cost-log.jsonl');
  });

  afterEach(() => {
    delete process.env.COST_LOG_PATH;
    delete process.env.DAILY_BUDGET_USD;
    delete process.env.CHAT_DETERMINISTIC_FALLBACK;
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('returns not exceeded when under limit', () => {
    writeFileSync(
      join(rootDir, 'cost-log.jsonl'),
      `${costLogLine(2)}`,
    );
    const status = getDailyBudgetStatus({ DAILY_BUDGET_USD: '10' });
    assert.equal(status.exceeded, false);
    assert.equal(status.limit, 10);
  });

  it('returns exceeded when at or over limit', () => {
    writeFileSync(
      join(rootDir, 'cost-log.jsonl'),
      `${costLogLine(12)}`,
    );
    const status = getDailyBudgetStatus({ DAILY_BUDGET_USD: '10' });
    assert.equal(status.exceeded, true);
  });

  it('httpChatBudgetPreHandler sets budgetDegraded when fallback enabled', async () => {
    writeFileSync(join(rootDir, 'cost-log.jsonl'), `${costLogLine(12)}`);
    process.env.CHAT_DETERMINISTIC_FALLBACK = '1';
    const request = {};
    const reply = {
      code() { return this; },
      send(payload) { this.payload = payload; return this; },
    };
    await httpChatBudgetPreHandler(request, reply);
    assert.equal(request.budgetDegraded, true);
    assert.equal(reply.payload, undefined);
  });

  it('httpChatBudgetPreHandler returns 429 when fallback disabled', async () => {
    writeFileSync(join(rootDir, 'cost-log.jsonl'), `${costLogLine(12)}`);
    process.env.CHAT_DETERMINISTIC_FALLBACK = '0';
    const request = {};
    const reply = {
      code(c) { this.statusCode = c; return this; },
      send(payload) { this.payload = payload; return this; },
    };
    await httpChatBudgetPreHandler(request, reply);
    assert.equal(reply.statusCode, 429);
    assert.equal(reply.payload.code, 'daily_budget_exceeded');
  });
});
