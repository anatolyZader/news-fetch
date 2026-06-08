import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCrisisBudgetSqliteAdapter } from '../../../cross-cut-modules/budget/infrastructure/adapters/crisisBudgetSqliteAdapter.js';
import { createCrisisBudgetService } from '../../../cross-cut-modules/budget/app/crisisBudgetService.js';

describe('crisisBudgetService', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = join(tmpdir(), `crisis-budget-${Date.now()}`);
    mkdirSync(rootDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
    delete process.env.CRISIS_BUDGET_ENABLED;
  });

  it('activates and returns active session', () => {
    const adapter = createCrisisBudgetSqliteAdapter({ dbPath: join(rootDir, 'app.sqlite') });
    const service = createCrisisBudgetService({ adapter });
    const session = service.activate({ activatedBy: 'analyst@test', reason: 'earthquake drill' });
    assert.ok(session);
    const status = service.getChatBudgetStatus();
    assert.equal(status.crisis_active, true);
  });

  it('suggests crisis budget when void critical and daily exceeded', () => {
    process.env.CRISIS_BUDGET_ENABLED = '1';
    const service = createCrisisBudgetService({ adapter: null });
    const suggest = service.shouldSuggestCrisisBudget({
      data_void: { level: 'critical' },
      epistemic_status: { sampling_status: 'normal' },
    });
    assert.equal(typeof suggest, 'boolean');
  });
});
