import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ObservationFsAdapter } from '../../../../business_modules/signals_extraction/infrastructure/adapters/observationFsAdapter.js';

describe('ObservationFsAdapter pipeline persistence', () => {
  it('writes empty pipeline bundle to disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'obs-fs-'));
    try {
      const store = new ObservationFsAdapter({ dataDir: dir });
      const path = store.writeBundle({
        profile: 'pipeline',
        source_type: 'pbo',
        content_kind: 'field_report',
        date: '2026-05-01',
        extracted_at: new Date().toISOString(),
        source_files: ['north_1_5.xlsx'],
        total_articles: 2,
        observations: [],
      });
      assert.ok(existsSync(path));
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      assert.equal(parsed.profile, 'pipeline');
      assert.equal(parsed.source_type, 'pbo');
      assert.deepEqual(parsed.observations, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
