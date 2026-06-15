import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroundingContext,
  daysSince,
} from '../../../../../business_modules/resilience/domain/services/actionCompassGrounding.js';

describe('buildGroundingContext', () => {
  it('extracts named clusters and channel health from data_void', () => {
    const ground = buildGroundingContext({
      date: '2026-06-14',
      data_void: {
        level: 'critical',
        digital_darkness: true,
        information_vacuum_index: 0.9,
        affected_clusters: [
          { cluster: 'kiryat_shmona', reason: 'cluster_digital_darkness', field_volume: 2, digital_volume: 0 },
          { cluster: '_global', source_type: 'telegram_channel', reason: 'channel_drop' },
        ],
      },
    });
    assert.deepEqual(ground.cluster_names, ['kiryat shmona']);
    assert.equal(ground.cluster_count, 1);
    assert.ok(ground.dark_channels.includes('telegram channel'));
    assert.equal(ground.digital_darkness, true);
    assert.equal(ground.vacuum_index, 0.9);
  });

  it('computes quarantine timing from digital_quarantine_state', () => {
    const ground = buildGroundingContext({
      date: '2026-06-15',
      digital_quarantine_state: {
        active: true,
        reason: 'digital_darkness',
        since: '2026-06-13T13:33:15.877Z',
        quarantined_count: 4,
      },
    });
    assert.equal(ground.quarantine.active, true);
    assert.equal(typeof ground.quarantine.day_count, 'number');
    assert.ok(ground.quarantine.day_count >= 1);
    assert.equal(ground.quarantine.reason, 'digital_darkness');
  });

  it('daysSince returns null for missing/invalid input and 0 for future since', () => {
    assert.equal(daysSince(null, '2026-06-14'), null);
    assert.equal(daysSince('not-a-date', '2026-06-14'), null);
    assert.equal(daysSince('2026-06-20T00:00:00Z', '2026-06-14'), 0);
  });

  it('returns safe defaults for empty assessment', () => {
    const ground = buildGroundingContext(null);
    assert.equal(ground.cluster_count, 0);
    assert.deepEqual(ground.cluster_names, []);
    assert.equal(ground.quarantine.active, false);
  });
});
