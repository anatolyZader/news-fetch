import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  getCostSpendTracker,
  resetCostSpendTrackerForTests,
} from '../../../cross-cut-modules/log/infrastructure/costSpendTracker.js';
import { datedJsonlPath } from '../../../cross-cut-modules/log/infrastructure/rotatingJsonl.js';

const dir = mkdtempSync(join(tmpdir(), 'spendtracker-'));
after(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.COST_LOG_PATH;
});

const today = new Date().toISOString().slice(0, 10);
const basePath = join(dir, 'cost-log.jsonl');
const todayPath = datedJsonlPath(basePath, today);

function row(cost, extra = {}) {
  return `${JSON.stringify({ timestamp: `${today}T10:00:00.000Z`, script: 'http:chat', totalCostUsd: cost, ...extra })}\n`;
}

beforeEach(() => {
  process.env.COST_LOG_PATH = basePath;
  rmSync(basePath, { force: true });
  rmSync(todayPath, { force: true });
  resetCostSpendTrackerForTests();
});

describe('costSpendTracker', () => {
  it('folds legacy + dated rows and picks up external appends incrementally', () => {
    writeFileSync(basePath, row(1));
    writeFileSync(todayPath, row(2, { owner_uid: 'u1' }));
    const tracker = getCostSpendTracker();
    assert.equal(tracker.todaySpendTotal(), 3);
    assert.equal(tracker.todaySpendForOwner('u1'), 2);

    // Simulate another process appending after the first read.
    appendFileSync(todayPath, row(4, { owner_uid: 'u1' }));
    assert.equal(tracker.todaySpendTotal(), 7);
    assert.equal(tracker.todaySpendForOwner('u1'), 6);
    assert.equal(tracker.todaySpendForScripts(['http:chat']), 7);
  });

  it('ignores a trailing partial line until it completes', () => {
    const tracker = getCostSpendTracker();
    writeFileSync(todayPath, row(1));
    assert.equal(tracker.todaySpendTotal(), 1);

    const partial = `{"timestamp":"${today}T11:00:00.000Z","script":"http:chat","totalCostUsd":5`;
    appendFileSync(todayPath, partial);
    assert.equal(tracker.todaySpendTotal(), 1);

    appendFileSync(todayPath, ',"owner_uid":"u2"}\n');
    assert.equal(tracker.todaySpendTotal(), 6);
    assert.equal(tracker.todaySpendForOwner('u2'), 5);
  });

  it('rebuilds after truncation', () => {
    const tracker = getCostSpendTracker();
    writeFileSync(todayPath, row(1) + row(2));
    assert.equal(tracker.todaySpendTotal(), 3);

    writeFileSync(todayPath, row(9));
    assert.equal(tracker.todaySpendTotal(), 9);
  });

  it('skips rows from other days', () => {
    const tracker = getCostSpendTracker();
    writeFileSync(basePath, `${JSON.stringify({ timestamp: '2020-01-01T00:00:00.000Z', script: 's', totalCostUsd: 100 })}\n${row(2)}`);
    assert.equal(tracker.todaySpendTotal(), 2);
  });

  it('matches a full scan on the same fixture (cross-check)', async () => {
    writeFileSync(basePath, row(1, { owner_uid: 'a' }) + row(2, { owner_uid: 'b' }));
    writeFileSync(todayPath, row(3, { owner_uid: 'a' }));
    const tracker = getCostSpendTracker();
    const viaTracker = tracker.todaySpendForOwner('a');

    process.env.BUDGET_SPEND_TRACKER_ENABLED = 'false';
    try {
      const { readTodayCostSpendForOwner } = await import('../../../cross-cut-modules/log/app/costLog.js');
      assert.equal(viaTracker, readTodayCostSpendForOwner('a'));
    } finally {
      delete process.env.BUDGET_SPEND_TRACKER_ENABLED;
    }
  });
});
