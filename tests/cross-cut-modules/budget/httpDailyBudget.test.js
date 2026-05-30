import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDailyBudgetStatus } from '../../../cross-cut-modules/budget/app/httpDailyBudget.js';

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
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('returns not exceeded when under limit', () => {
    writeFileSync(
      join(rootDir, 'cost-log.jsonl'),
      `${JSON.stringify({ timestamp: `${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`, totalCostUsd: 2 })}\n`,
    );
    const status = getDailyBudgetStatus({ DAILY_BUDGET_USD: '10' });
    assert.equal(status.exceeded, false);
    assert.equal(status.limit, 10);
  });

  it('returns exceeded when at or over limit', () => {
    writeFileSync(
      join(rootDir, 'cost-log.jsonl'),
      `${JSON.stringify({ timestamp: `${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`, totalCostUsd: 12 })}\n`,
    );
    const status = getDailyBudgetStatus({ DAILY_BUDGET_USD: '10' });
    assert.equal(status.exceeded, true);
  });
});
