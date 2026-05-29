import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  buildQuarantineState,
  endOfUtcDayIso,
  loadActiveQuarantine,
} from '../../../../../business_modules/resilience/domain/services/dataVoid/digitalQuarantineState.js';
import { QUARANTINE_REASON } from '../../../../../business_modules/resilience/domain/services/dataVoid/scoringPartition.js';

describe('digitalQuarantineState', () => {
  it('endOfUtcDayIso returns end of UTC day', () => {
    const end = endOfUtcDayIso('2026-05-29');
    assert.ok(end.startsWith('2026-05-29T23:59:59'));
  });

  it('loadActiveQuarantine reads same-date report state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'quarantine-'));
    try {
      writeFileSync(join(dir, 'resilience-report-2026-05-29-1200.json'), JSON.stringify({
        assessment: {
          digital_quarantine_state: {
            active: true,
            reason: 'digital_darkness',
            since: '2026-05-29T10:00:00.000Z',
            expires: endOfUtcDayIso('2026-05-29'),
          },
        },
      }));
      const state = loadActiveQuarantine('2026-05-29', 'national', dir);
      assert.equal(state?.active, true);
      assert.equal(state?.reason, 'digital_darkness');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('buildQuarantineState persists partition metadata', () => {
    const state = buildQuarantineState({
      partitionApplied: true,
      assessmentMode: 'field_anchor_only',
      quarantineReason: QUARANTINE_REASON.CONNECTIVITY_ISOLATION,
      quarantinedSignals: [{ source_type: 'telegram' }],
    }, { level: 'critical' }, { scopeId: 'north', reportDate: '2026-05-29' });
    assert.equal(state?.active, true);
    assert.equal(state?.quarantined_count, 1);
    assert.equal(state?.scope, 'north');
  });
});
