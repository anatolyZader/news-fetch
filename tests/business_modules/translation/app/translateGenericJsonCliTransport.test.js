import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { translateGenericJson } from '../../../../business_modules/translation/app/translateGenericJson.js';
import { setSharedLlmPort } from '../../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { readJsonlRecords } from '../../../../cross-cut-modules/log/infrastructure/jsonlLog.js';

function fakePort(transport) {
  return {
    ...(transport ? { transport } : {}),
    createMessage: async () => ({
      content: [{ type: 'text', text: '{"title":"translated"}' }],
      usage: { input_tokens: 40_000, output_tokens: 10_000 },
      stop_reason: 'end_turn',
    }),
  };
}

let dir;
let prevPath;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'translate-cli-'));
  prevPath = process.env.COST_LOG_PATH;
  process.env.COST_LOG_PATH = join(dir, 'cost-log.jsonl');
});
afterEach(() => {
  setSharedLlmPort(null);
  if (prevPath == null) delete process.env.COST_LOG_PATH;
  else process.env.COST_LOG_PATH = prevPath;
  rmSync(dir, { recursive: true, force: true });
});

describe('translateGenericJson claude-cli transport', () => {
  it('writes a $0 cost-log entry with a transport tag when the port is subscription-billed', async () => {
    setSharedLlmPort(fakePort('claude-cli'));
    await translateGenericJson({ title: 'hello' }, 'he', { costLabel: 'translation-test' });

    const rows = [...readJsonlRecords(process.env.COST_LOG_PATH)];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].totalCostUsd, 0);
    assert.equal(rows[0].breakdown.sonnet, 0);
  });

  it('keeps nominal Sonnet pricing on the metered transport', async () => {
    setSharedLlmPort(fakePort(null));
    await translateGenericJson({ title: 'hello' }, 'he', { costLabel: 'translation-test' });

    const rows = [...readJsonlRecords(process.env.COST_LOG_PATH)];
    assert.equal(rows.length, 1);
    assert.ok(rows[0].totalCostUsd > 0);
    assert.ok(rows[0].breakdown.sonnet > 0);
  });
});
