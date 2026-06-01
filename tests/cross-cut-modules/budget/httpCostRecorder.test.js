import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHttpCostRecorder } from '../../../cross-cut-modules/budget/app/httpCostRecorder.js';
import { getDailyBudgetStatus } from '../../../cross-cut-modules/budget/app/httpDailyBudget.js';

describe('httpCostRecorder', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = join(tmpdir(), `budget-recorder-${Date.now()}`);
    mkdirSync(rootDir, { recursive: true });
    process.env.COST_LOG_PATH = join(rootDir, 'cost-log.jsonl');
  });

  afterEach(() => {
    delete process.env.COST_LOG_PATH;
    delete process.env.DAILY_BUDGET_USD;
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('flush appends to cost log and increases readTodayCostSpend', () => {
    const recorder = createHttpCostRecorder({ script: 'http:chat-test' });
    recorder.onUsage({
      label: 'chat:round-0',
      model: 'claude-haiku-4-5-20251001',
      usage: { input_tokens: 1000, output_tokens: 200 },
    });
    const { flushed, totalCostUsd } = recorder.flush();
    assert.equal(flushed, true);
    assert.ok(totalCostUsd > 0);

    const status = getDailyBudgetStatus({ DAILY_BUDGET_USD: '100' });
    assert.ok(status.spent >= totalCostUsd);
  });

  it('flush is no-op when no usage recorded', () => {
    const recorder = createHttpCostRecorder({ script: 'http:empty' });
    const { flushed } = recorder.flush();
    assert.equal(flushed, false);
    const status = getDailyBudgetStatus({ DAILY_BUDGET_USD: '100' });
    assert.equal(status.spent, 0);
  });
});
