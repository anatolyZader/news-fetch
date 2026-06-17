import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  appendCostLog,
  readCostForRunId,
} from '../../../cross-cut-modules/log/app/costLog.js';

describe('costLog pipelineRunId', () => {
  let rootDir;
  let logPath;
  let prevCostLog;
  let prevPipelineRunId;

  const runId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  beforeEach(() => {
    rootDir = join(tmpdir(), `cost-log-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(rootDir, { recursive: true });
    logPath = join(rootDir, 'cost-log.jsonl');

    prevCostLog = process.env.COST_LOG_PATH;
    prevPipelineRunId = process.env.PIPELINE_RUN_ID;
    process.env.COST_LOG_PATH = logPath;
    process.env.PIPELINE_RUN_ID = runId;
  });

  afterEach(() => {
    if (prevCostLog == null) delete process.env.COST_LOG_PATH;
    else process.env.COST_LOG_PATH = prevCostLog;
    if (prevPipelineRunId == null) delete process.env.PIPELINE_RUN_ID;
    else process.env.PIPELINE_RUN_ID = prevPipelineRunId;
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('appendCostLog auto-tags pipelineRunId from env', () => {
    appendCostLog({
      script: 'extract-signals',
      date: '2026-04-11',
      totalCostUsd: 0.25,
      usageLog: [{ model: 'claude-haiku-4-5-20251001', cost: 0.25 }],
    });

    const result = readCostForRunId(logPath, runId);
    assert.equal(result.total_usd, 0.25);
    assert.equal(result.by_script['extract-signals'], 0.25);
    assert.equal(result.entries[0].pipelineRunId, runId);
  });

  it('readCostForRunId ignores rows from other runs', () => {
    writeFileSync(logPath, [
      JSON.stringify({
        timestamp: '2026-06-13T10:00:00.000Z',
        script: 'assess-signals',
        date: '2026-04-11',
        pipelineRunId: runId,
        totalCostUsd: 1.5,
      }),
      JSON.stringify({
        timestamp: '2026-06-13T11:00:00.000Z',
        script: 'assess-signals',
        date: '2026-04-11',
        pipelineRunId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        totalCostUsd: 2,
      }),
    ].join('\n'));

    const result = readCostForRunId(logPath, runId);
    assert.equal(result.total_usd, 1.5);
    assert.equal(result.entries.length, 1);
  });
});
