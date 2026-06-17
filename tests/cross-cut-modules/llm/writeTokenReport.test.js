import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { writeTokenReport } from '../../../cross-cut-modules/llm/writeTokenReport.js';

describe('writeTokenReport', () => {
  let rootDir;
  let prevInvocations;
  let prevCostLog;

  const runA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const runB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  beforeEach(() => {
    rootDir = join(tmpdir(), `token-report-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(rootDir, { recursive: true });

    prevInvocations = process.env.LLM_INVOCATIONS_PATH;
    prevCostLog = process.env.COST_LOG_PATH;
    process.env.LLM_INVOCATIONS_PATH = join(rootDir, 'llm-invocations.jsonl');
    process.env.COST_LOG_PATH = join(rootDir, 'cost-log.jsonl');

    writeFileSync(process.env.LLM_INVOCATIONS_PATH, [
      JSON.stringify({
        timestamp: '2026-06-13T13:10:00.000Z',
        pipelineRunId: runA,
        feature: 'open_extraction',
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 1000,
        outputTokens: 200,
        costUsd: 0.5,
      }),
      JSON.stringify({
        timestamp: '2026-06-13T13:11:00.000Z',
        pipelineRunId: runA,
        feature: 'planner',
        model: 'claude-sonnet-4-6',
        inputTokens: 500,
        outputTokens: 100,
        costUsd: 0.3,
      }),
      JSON.stringify({
        timestamp: '2026-06-13T13:12:00.000Z',
        pipelineRunId: runB,
        feature: 'open_extraction',
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 2000,
        outputTokens: 400,
        costUsd: 0.9,
      }),
    ].join('\n'));

    writeFileSync(process.env.COST_LOG_PATH, [
      JSON.stringify({
        timestamp: '2026-06-13T13:15:00.000Z',
        script: 'extract-signals',
        date: '2026-04-11',
        pipelineRunId: runA,
        totalCostUsd: 0.12,
      }),
      JSON.stringify({
        timestamp: '2026-06-13T13:20:00.000Z',
        script: 'assess-signals',
        date: '2026-04-11',
        pipelineRunId: runA,
        totalCostUsd: 0.68,
      }),
      JSON.stringify({
        timestamp: '2026-06-13T13:20:00.000Z',
        script: 'assess-signals',
        date: '2026-04-11',
        pipelineRunId: runB,
        totalCostUsd: 0.9,
      }),
    ].join('\n'));
  });

  afterEach(() => {
    if (prevInvocations == null) delete process.env.LLM_INVOCATIONS_PATH;
    else process.env.LLM_INVOCATIONS_PATH = prevInvocations;
    if (prevCostLog == null) delete process.env.COST_LOG_PATH;
    else process.env.COST_LOG_PATH = prevCostLog;
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('filters by pipelineRunId and merges cost-log script totals', () => {
    const reportsDir = join(rootDir, 'reports');
    const latestPath = writeTokenReport({
      startedAt: '2026-06-13T13:09:00.000Z',
      completedAt: '2026-06-13T13:30:00.000Z',
      date: '2026-04-11',
      scope: 'north',
      days: 3,
      reportsDir,
      rootDir,
      pipelineRunId: runA,
    });

    const report = JSON.parse(readFileSync(latestPath, 'utf8'));
    assert.equal(report.runId, runA);
    assert.equal(report.summary.invocations, 2);
    assert.equal(report.summary.costUsd, 0.8);
    assert.equal(report.pipeline.llmCostUsd, 0.8);
    assert.equal(report.pipeline.totalCostUsd, 0.8);
    assert.equal(report.pipeline.byScript['extract-signals'], 0.12);
    assert.equal(report.pipeline.byScript['assess-signals'], 0.68);
    assert.equal(report.pipeline.costLogEntries, 2);

    const runPath = join(reportsDir, 'token-report-runs', `${runA}.json`);
    assert.equal(readFileSync(runPath, 'utf8'), readFileSync(latestPath, 'utf8'));
  });

  it('falls back to llmCostUsd when cost-log has no rows for the run', () => {
    const reportsDir = join(rootDir, 'reports');
    const latestPath = writeTokenReport({
      startedAt: '2026-06-13T13:09:00.000Z',
      completedAt: '2026-06-13T13:30:00.000Z',
      date: '2026-04-11',
      scope: 'north',
      days: 3,
      reportsDir,
      rootDir,
      pipelineRunId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    });

    const report = JSON.parse(readFileSync(latestPath, 'utf8'));
    assert.equal(report.summary.invocations, 0);
    assert.equal(report.pipeline.totalCostUsd, 0);
    assert.equal(report.pipeline.llmCostUsd, 0);
    assert.equal(report.pipeline.costLogEntries, 0);
  });

  it('uses legacy time window when pipelineRunId is absent', () => {
    const reportsDir = join(rootDir, 'reports');
    const latestPath = writeTokenReport({
      startedAt: '2026-06-13T13:09:30.000Z',
      completedAt: '2026-06-13T13:11:30.000Z',
      date: '2026-04-11',
      scope: 'north',
      days: 3,
      reportsDir,
      rootDir,
    });

    const report = JSON.parse(readFileSync(latestPath, 'utf8'));
    assert.equal(report.runId, undefined);
    assert.equal(report.summary.invocations, 2);
    assert.equal(report.summary.costUsd, 0.8);
    assert.equal(report.pipeline.totalCostUsd, 0.8);
  });
});
