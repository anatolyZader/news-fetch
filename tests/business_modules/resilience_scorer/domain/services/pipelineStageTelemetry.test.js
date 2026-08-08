import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  summarizeStageEvents,
  readCostLogStagesForDate,
  extractionTelemetryForUser,
} from '../../../../../business_modules/resilience_scorer/domain/services/pipeline/pipelineStageTelemetry.js';

describe('pipelineStageTelemetry', () => {
  it('summarizeStageEvents aggregates per stage', () => {
    const out = summarizeStageEvents([
      { stage: 'evidence_verifier', stats: { kept: 8, dropped: 2, input: 10, reason_counts: { no_match: 2 } } },
      { stage: 'self_check', stats: { kept: 7, dropped: 1, input: 8, reason_counts: { hallucination: 1 } } },
    ]);
    assert.equal(out.totals.kept, 15);
    assert.equal(out.totals.dropped, 3);
    assert.equal(out.perStage.evidence_verifier.kept, 8);
    assert.equal(out.perStage.self_check.reason_counts.hallucination, 1);
  });

  it('readCostLogStagesForDate returns latest per script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cost-log-'));
    const logPath = join(dir, 'cost-log.jsonl');
    writeFileSync(
      logPath,
      [
        JSON.stringify({
          date: '2026-05-10',
          script: 'extract-signals',
          stages: { perStage: { x: { kept: 1 } }, totals: { kept: 1 } },
        }),
        JSON.stringify({
          date: '2026-05-10',
          script: 'extract-signals',
          stages: { perStage: { x: { kept: 9 } }, totals: { kept: 9 } },
        }),
      ].join('\n') + '\n',
    );
    const prev = process.env.COST_LOG_PATH;
    process.env.COST_LOG_PATH = logPath;
    try {
      const stages = readCostLogStagesForDate('2026-05-10', { scripts: ['extract-signals'] });
      assert.equal(stages['extract-signals'].totals.kept, 9);
    } finally {
      if (prev === undefined) delete process.env.COST_LOG_PATH;
      else process.env.COST_LOG_PATH = prev;
    }
  });

  it('extractionTelemetryForUser strips reason_counts', () => {
    const op = extractionTelemetryForUser({
      assess: {
        totals: { kept: 5, dropped: 1, input: 6 },
        perStage: { v: { kept: 5, dropped: 1, input: 6, reason_counts: { x: 1 } } },
      },
    });
    assert.equal(op.assess.totals.kept, 5);
    assert.equal(op.assess.per_stage.v.reason_counts, undefined);
  });
});
