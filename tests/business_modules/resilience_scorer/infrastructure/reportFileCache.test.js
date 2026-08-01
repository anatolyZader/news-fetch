import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  getDirNamesCached,
  getParsedReportCached,
  getReportMetaCached,
  resetReportFileCacheForTests,
} from '../../../../business_modules/resilience_scorer/infrastructure/reportFileCache.js';

const dir = mkdtempSync(join(tmpdir(), 'reportcache-'));
after(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => resetReportFileCacheForTests());

function writeReport(name, payload) {
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(payload));
  return p;
}

describe('getParsedReportCached', () => {
  it('returns the same object on a hit and reparses after mtime change', () => {
    const p = writeReport('r1.json', { v: 1 });
    const first = getParsedReportCached(p);
    const second = getParsedReportCached(p);
    assert.equal(first, second);
    assert.equal(first.v, 1);

    writeFileSync(p, JSON.stringify({ v: 2 }));
    utimesSync(p, new Date(), new Date(Date.now() + 5000));
    const third = getParsedReportCached(p);
    assert.equal(third.v, 2);
    assert.notEqual(third, first);
  });

  it('evicts least-recently-used entries beyond the cap', () => {
    const paths = [];
    for (let i = 0; i < 8; i += 1) {
      paths.push(writeReport(`lru-${i}.json`, { i }));
    }
    for (const p of paths) getParsedReportCached(p);
    // Cap is 6: the first two should have been evicted → new object identity.
    const again = getParsedReportCached(paths[0]);
    assert.equal(again.i, 0);
  });

  it('bypasses the cache when disabled', () => {
    process.env.REPORT_CACHE_ENABLED = 'false';
    try {
      const p = writeReport('off.json', { v: 1 });
      const a = getParsedReportCached(p);
      const b = getParsedReportCached(p);
      assert.notEqual(a, b);
    } finally {
      delete process.env.REPORT_CACHE_ENABLED;
    }
  });

  it('freezes cached payloads outside production', () => {
    const p = writeReport('frozen.json', { assessment: { x: 1 } });
    const parsed = getParsedReportCached(p);
    assert.ok(Object.isFrozen(parsed));
    assert.ok(Object.isFrozen(parsed.assessment));
  });
});

describe('getReportMetaCached', () => {
  it('derives once per file version', () => {
    const p = writeReport('meta.json', { generated_at: 'x' });
    let calls = 0;
    const derive = (parsed) => { calls += 1; return { g: parsed.generated_at }; };
    assert.deepEqual(getReportMetaCached(p, derive), { g: 'x' });
    assert.deepEqual(getReportMetaCached(p, derive), { g: 'x' });
    assert.equal(calls, 1);

    writeFileSync(p, JSON.stringify({ generated_at: 'y' }));
    utimesSync(p, new Date(), new Date(Date.now() + 5000));
    assert.deepEqual(getReportMetaCached(p, derive), { g: 'y' });
    assert.equal(calls, 2);
  });

  it('throws on missing files (caller keeps catch semantics)', () => {
    assert.throws(() => getReportMetaCached(join(dir, 'nope.json'), (x) => x));
  });
});

describe('getDirNamesCached', () => {
  it('serves cached listings on hits and sees new entries via dir mtime', () => {
    writeFileSync(join(dir, 'seed.txt'), '');
    const names1 = getDirNamesCached(dir);
    const names2 = getDirNamesCached(dir);
    assert.equal(names2, names1);

    writeFileSync(join(dir, 'added-later.txt'), '');
    utimesSync(dir, new Date(), new Date(Date.now() + 5000));
    const names3 = getDirNamesCached(dir);
    assert.ok(names3.includes('added-later.txt'));
  });

  it('returns [] for unreadable dirs', () => {
    assert.deepEqual(getDirNamesCached(join(dir, 'missing-dir')), []);
  });
});
