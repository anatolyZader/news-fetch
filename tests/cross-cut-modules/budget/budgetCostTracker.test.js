import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCostTracker } from '../../../cross-cut-modules/budget/index.js';

describe('createCostTracker claude-cli transport', () => {
  it('logs tokens at $0 and keeps subscription usage out of the cost cap', () => {
    const { onUsage, getTotal } = createCostTracker({ label: 'test', maxCostUsd: 0.0001 });

    // Would blow past the $0.0001 cap at API prices if it were counted.
    onUsage({
      label: 'batch 1',
      model: 'claude-haiku-4-5-20251001',
      usage: { input_tokens: 500_000, output_tokens: 100_000 },
      transport: 'claude-cli',
    });

    const { totalCostUsd, usageLog } = getTotal();
    assert.equal(totalCostUsd, 0);
    assert.equal(usageLog.length, 1);
    assert.equal(usageLog[0].cost, 0);
    assert.equal(usageLog[0].transport, 'claude-cli');
    assert.equal(usageLog[0].usage.input_tokens, 500_000);
  });

  it('still charges metered calls without a transport tag', () => {
    const { onUsage, getTotal } = createCostTracker({ label: 'test' });
    onUsage({
      label: 'batch 1',
      model: 'claude-haiku-4-5-20251001',
      usage: { input_tokens: 1000, output_tokens: 100 },
    });
    assert.ok(getTotal().totalCostUsd > 0);
  });
});
