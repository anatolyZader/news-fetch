import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  buildIntegrityManifest,
  compareIntegrityManifests,
  compareIntegrityManifestRecords,
  INTEGRITY_PATHS,
} from '../../../cross-cut-modules/security/app/integrityManifest.js';

describe('integrityManifest', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'integrity-'));
    writeFileSync(join(tempDir, 'package-lock.json'), '{"lockfileVersion":3}\n');
    writeFileSync(join(tempDir, '.nvmrc'), '22.13.0\n');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('INTEGRITY_PATHS includes lockfiles and openapi', () => {
    assert.ok(INTEGRITY_PATHS.includes('package-lock.json'));
    assert.ok(INTEGRITY_PATHS.includes('openapi/openapi.yaml'));
  });

  it('buildIntegrityManifest hashes tracked files', async () => {
    const manifest = await buildIntegrityManifest({
      rootDir: tempDir,
      includeClientDist: false,
      gitSha: 'abc123',
    });

    assert.equal(manifest.version, 1);
    assert.equal(manifest.gitSha, 'abc123');
    assert.ok(manifest.files['package-lock.json']);
    assert.ok(manifest.files['.nvmrc']);
    assert.equal(Object.keys(manifest.files).length, 2);
  });

  it('compareIntegrityManifests reports drifts', () => {
    const baseline = { 'package-lock.json': 'aaa', '.nvmrc': 'bbb' };
    const current = { 'package-lock.json': 'aaa', '.nvmrc': 'ccc' };

    const result = compareIntegrityManifests(baseline, current);
    assert.equal(result.ok, false);
    assert.equal(result.drifts.length, 1);
    assert.equal(result.drifts[0].path, '.nvmrc');
    assert.equal(result.drifts[0].expected, 'bbb');
    assert.equal(result.drifts[0].actual, 'ccc');
  });

  it('compareIntegrityManifestRecords wraps file maps', () => {
    const result = compareIntegrityManifestRecords(
      { files: { a: '1' } },
      { files: { a: '1' } },
    );
    assert.equal(result.ok, true);
  });
});
