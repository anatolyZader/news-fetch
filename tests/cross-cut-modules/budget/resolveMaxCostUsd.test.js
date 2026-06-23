import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { resolveMaxCostUsd } from '../../../cross-cut-modules/budget/app/budgetCostTracker.js';

describe('resolveMaxCostUsd', () => {
  /** @type {string|undefined} */
  let prevMax;

  beforeEach(() => {
    prevMax = process.env.MAX_COST_USD;
    delete process.env.MAX_COST_USD;
  });

  afterEach(() => {
    if (prevMax === undefined) delete process.env.MAX_COST_USD;
    else process.env.MAX_COST_USD = prevMax;
  });

  it('defaults to $3 for generic scripts', () => {
    assert.equal(resolveMaxCostUsd({ script: 'extract-signals' }), 3);
  });

  it('raises cap for north assess', () => {
    assert.equal(resolveMaxCostUsd({ script: 'assess-signals', scope: 'north' }), 6);
  });

  it('raises cap for large national assess bundles', () => {
    assert.equal(resolveMaxCostUsd({ script: 'assess-signals', scope: 'national', signalCount: 1500 }), 5);
  });

  it('honors MAX_COST_USD env override', () => {
    process.env.MAX_COST_USD = '8.5';
    assert.equal(resolveMaxCostUsd({ script: 'assess-signals', scope: 'north' }), 8.5);
  });
});
