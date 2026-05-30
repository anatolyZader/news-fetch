import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHealthService } from '../../../cross-cut-modules/monitoring/app/healthService.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('healthService public vs detail', () => {
  it('getPublicHealth omits filesystem paths', () => {
    const rootDir = join(tmpdir(), `health-public-${Date.now()}`);
    mkdirSync(join(rootDir, 'db'), { recursive: true });
    writeFileSync(join(rootDir, 'db/app.sqlite'), '');

    const svc = createHealthService({
      rootDir,
      sqlitePath: join(rootDir, 'db/app.sqlite'),
    });
    const pub = svc.getPublicHealth();
    assert.equal(typeof pub.status, 'string');
    assert.equal(pub.checks, undefined);
    assert.equal(pub.uptime_s, undefined);

    const detail = svc.getHealth();
    assert.ok(detail.checks);
    assert.ok(detail.checks.sqlite.path);

    rmSync(rootDir, { recursive: true, force: true });
  });
});
