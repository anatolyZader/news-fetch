import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  appendRotatedJsonl,
  datedJsonlPath,
  listRotatedJsonlPaths,
  readRotatedJsonlForDate,
  readRotatedJsonlRecords,
} from '../../../cross-cut-modules/log/infrastructure/rotatingJsonl.js';
import { readJsonlRecords } from '../../../cross-cut-modules/log/infrastructure/jsonlLog.js';

const dir = mkdtempSync(join(tmpdir(), 'rotjsonl-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const today = new Date().toISOString().slice(0, 10);

describe('rotatingJsonl', () => {
  it('datedJsonlPath injects the date before the extension', () => {
    assert.equal(datedJsonlPath('/x/cost-log.jsonl', '2026-07-31'), '/x/cost-log-2026-07-31.jsonl');
  });

  it('appends to the dated file when rotation is on', () => {
    const base = join(dir, 'a.jsonl');
    appendRotatedJsonl(base, { v: 1 });
    assert.deepEqual(readJsonlRecords(datedJsonlPath(base, today)), [{ v: 1 }]);
    assert.deepEqual(readJsonlRecords(base), []);
  });

  it('appends to the legacy file when rotation is off', () => {
    process.env.LOG_ROTATION_ENABLED = 'false';
    try {
      const base = join(dir, 'b.jsonl');
      appendRotatedJsonl(base, { v: 2 });
      assert.deepEqual(readJsonlRecords(base), [{ v: 2 }]);
    } finally {
      delete process.env.LOG_ROTATION_ENABLED;
    }
  });

  it('readRotatedJsonlForDate merges legacy + dated', () => {
    const base = join(dir, 'c.jsonl');
    writeFileSync(base, `${JSON.stringify({ src: 'legacy' })}\n`);
    appendRotatedJsonl(base, { src: 'dated' });
    const rows = readRotatedJsonlForDate(base, today);
    assert.deepEqual(rows.map((r) => r.src).sort(), ['dated', 'legacy']);
  });

  it('listRotatedJsonlPaths includes only existing files in the window', () => {
    const base = join(dir, 'd.jsonl');
    appendRotatedJsonl(base, { v: 3 });
    const paths = listRotatedJsonlPaths(base, { days: 3 });
    assert.deepEqual(paths, [datedJsonlPath(base, today)]);
    assert.equal(readRotatedJsonlRecords(base, { days: 3 }).length, 1);
  });
});
