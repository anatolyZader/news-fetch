import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createHealthService } from '../../../cross-cut-modules/monitoring/app/healthService.js';

const rootDir = join(tmpdir(), `health-deep-${process.pid}`);
mkdirSync(join(rootDir, 'db'), { recursive: true });
writeFileSync(join(rootDir, 'db/app.sqlite'), '');
mkdirSync(join(rootDir, 'business_modules/resilience_scorer/data/daily_reports'), { recursive: true });
mkdirSync(join(rootDir, 'cross-cut-modules/log/data'), { recursive: true });
writeFileSync(join(rootDir, 'cross-cut-modules/log/data/cost-log.jsonl'), '');

after(() => rmSync(rootDir, { recursive: true, force: true }));

describe('healthService deep checks', () => {
  it('uses injected sqlitePing over file existence', () => {
    const svc = createHealthService({
      rootDir,
      sqlitePath: join(rootDir, 'db/app.sqlite'),
      sqlitePing: () => false,
    });
    const health = svc.getHealth();
    assert.equal(health.checks.sqlite.ok, false);
    assert.equal(health.status, 'unhealthy');
  });

  it('reports degraded when loop lag exceeds the threshold', () => {
    const svc = createHealthService({
      rootDir,
      sqlitePath: join(rootDir, 'db/app.sqlite'),
      sqlitePing: () => true,
      getLoopDelayMs: () => 500,
    });
    const health = svc.getHealth();
    assert.equal(health.checks.event_loop.ok, false);
    assert.equal(health.checks.event_loop.lag_ms, 500);
    assert.equal(health.status, 'degraded');
  });

  it('keeps legacy behavior when nothing is injected', () => {
    const svc = createHealthService({
      rootDir,
      sqlitePath: join(rootDir, 'db/app.sqlite'),
    });
    const health = svc.getHealth();
    assert.equal(health.checks.sqlite.ok, true);
    assert.equal(health.checks.event_loop, undefined);
  });

  it('healthy loop lag stays ok', () => {
    const svc = createHealthService({
      rootDir,
      sqlitePath: join(rootDir, 'db/app.sqlite'),
      sqlitePing: () => true,
      getLoopDelayMs: () => 5,
    });
    const health = svc.getHealth();
    assert.equal(health.checks.event_loop.ok, true);
    assert.equal(health.status, 'ok');
  });
});
