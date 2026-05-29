import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  evaluateOovBurst,
  loadOovCaptureRecordsForDate,
} from '../../../../../business_modules/resilience/domain/services/oovBurstAlert.js';
import { LEARNING_CAPTURE_KINDS } from '../../../../../cross-cut-modules/learningCapture/kinds.js';

describe('oovBurstAlert', () => {
  it('returns no alert when file missing', async () => {
    const result = await evaluateOovBurst('2099-01-01', { reportsDir: join(tmpdir(), 'no-oov-dir') });
    assert.equal(result.alert, false);
    assert.equal(result.total, 0);
  });

  it('critical alert when unknown count exceeds threshold', async () => {
    const dir = join(tmpdir(), `oov-burst-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const date = '2026-05-20';
    const anchorMs = Date.parse(`${date}T14:00:00.000Z`);
    const lines = Array.from({ length: 6 }, (_, i) => JSON.stringify({
      capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
      suggested_type: `novel_behavior_${i}`,
      evidence: `Unknown pattern ${i} observed in shelter`,
      source_label: 'field-report',
      timestamp: `${date}T13:${String(i).padStart(2, '0')}:00Z`,
    }));
    writeFileSync(join(dir, `oov-capture-${date}.jsonl`), `${lines.join('\n')}\n`);

    const prev = process.env.RESILIENCE_OOV_CAPTURE;
    process.env.RESILIENCE_OOV_CAPTURE = '1';
    process.env.RESILIENCE_OOV_OPERATOR_MIN = '5';
    process.env.RESILIENCE_OOV_CLUSTER_WINDOW_HOURS = '24';
    try {
      const loaded = loadOovCaptureRecordsForDate(date, dir);
      assert.equal(loaded.length, 6);
      const result = await evaluateOovBurst(date, { reportsDir: dir, anchorMs });
      assert.equal(result.alert, true);
      assert.equal(result.level, 'critical');
      assert.equal(result.total, 6);
      assert.ok(result.window_hours > 0);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_OOV_CAPTURE;
      else process.env.RESILIENCE_OOV_CAPTURE = prev;
      delete process.env.RESILIENCE_OOV_OPERATOR_MIN;
      delete process.env.RESILIENCE_OOV_CLUSTER_WINDOW_HOURS;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warning alert on field cluster within window', async () => {
    const dir = join(tmpdir(), `oov-burst-cluster-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const date = '2026-05-21';
    const anchorMs = Date.parse(`${date}T14:00:00.000Z`);
    const suggestedType = 'shelter_hoarding_behavior';
    const lines = [1, 2, 3, 4].map((i) => JSON.stringify({
      capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
      suggested_type: suggestedType,
      evidence: `${suggestedType} reported in community ${i}`,
      source_label: 'field-report-batch',
      timestamp: `${date}T13:${String(i * 10).padStart(2, '0')}:00Z`,
    }));
    writeFileSync(join(dir, `oov-capture-${date}.jsonl`), `${lines.join('\n')}\n`);

    process.env.RESILIENCE_OOV_CAPTURE = '1';
    process.env.RESILIENCE_OOV_OPERATOR_MIN = '10';
    process.env.RESILIENCE_OOV_CLUSTER_WINDOW_HOURS = '24';
    try {
      const result = await evaluateOovBurst(date, { reportsDir: dir, anchorMs });
      assert.equal(result.alert, true);
      assert.equal(result.level, 'warning');
      assert.equal(result.top_cluster_count, 4);
    } finally {
      delete process.env.RESILIENCE_OOV_CAPTURE;
      delete process.env.RESILIENCE_OOV_OPERATOR_MIN;
      delete process.env.RESILIENCE_OOV_CLUSTER_WINDOW_HOURS;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
