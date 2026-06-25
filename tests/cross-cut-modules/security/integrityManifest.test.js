import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  buildIntegrityManifest,
  buildClientDistAggregate,
  compareIntegrityManifests,
  compareIntegrityManifestRecords,
  splitManifestFiles,
  INTEGRITY_PATHS,
  INTEGRITY_MANIFEST_VERSION,
  CLIENT_DIST_AGGREGATE_KEY,
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

  it('buildIntegrityManifest hashes tracked files only in files map (v2)', async () => {
    const manifest = await buildIntegrityManifest({
      rootDir: tempDir,
      includeClientDist: false,
      gitSha: 'abc123',
    });

    assert.equal(manifest.version, INTEGRITY_MANIFEST_VERSION);
    assert.equal(manifest.gitSha, 'abc123');
    assert.ok(manifest.files['package-lock.json']);
    assert.ok(manifest.files['.nvmrc']);
    assert.equal(manifest.clientDist, undefined);
    assert.equal(Object.keys(manifest.files).length, 2);
  });

  it('buildClientDistAggregate rolls up dist files', async () => {
    const distDir = join(tempDir, 'client/dist/assets');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'index-abc.js'), 'console.log(1);\n');
    writeFileSync(join(tempDir, 'client/dist/index.html'), '<html></html>\n');

    const aggregate = await buildClientDistAggregate(tempDir);
    assert.ok(aggregate);
    assert.equal(aggregate.fileCount, 2);
    assert.match(aggregate.aggregateSha256, /^[a-f0-9]{64}$/);

    const manifest = await buildIntegrityManifest({ rootDir: tempDir, gitSha: null });
    assert.equal(manifest.clientDist?.aggregateSha256, aggregate.aggregateSha256);
    assert.equal(manifest.clientDist?.fileCount, 2);
    assert.equal(Object.keys(manifest.files).length, 2);
  });

  it('splitManifestFiles separates client/dist paths', () => {
    const { supplyChain, clientDist } = splitManifestFiles({
      'package-lock.json': 'a',
      'client/dist/index.html': 'b',
    });
    assert.deepEqual(supplyChain, { 'package-lock.json': 'a' });
    assert.deepEqual(clientDist, { 'client/dist/index.html': 'b' });
  });

  it('compareIntegrityManifests reports drifts', () => {
    const baseline = { 'package-lock.json': 'aaa', '.nvmrc': 'bbb' };
    const current = { 'package-lock.json': 'aaa', '.nvmrc': 'ccc' };

    const result = compareIntegrityManifests(baseline, current);
    assert.equal(result.ok, false);
    assert.equal(result.drifts.length, 1);
    assert.equal(result.drifts[0].path, '.nvmrc');
  });

  it('compareIntegrityManifestRecords compares v2 clientDist aggregate', () => {
    const baseline = {
      version: 2,
      files: { 'package-lock.json': '1' },
      clientDist: { aggregateSha256: 'abc', fileCount: 3 },
    };
    const current = {
      version: 2,
      files: { 'package-lock.json': '1' },
      clientDist: { aggregateSha256: 'def', fileCount: 3 },
    };
    const result = compareIntegrityManifestRecords(baseline, current);
    assert.equal(result.ok, false);
    assert.equal(result.drifts.length, 1);
    assert.equal(result.drifts[0].path, CLIENT_DIST_AGGREGATE_KEY);
  });

  it('compareIntegrityManifestRecords wraps file maps (v2)', () => {
    const record = {
      version: 2,
      files: { a: '1' },
      clientDist: { aggregateSha256: 'x', fileCount: 1 },
    };
    const result = compareIntegrityManifestRecords(record, { ...record });
    assert.equal(result.ok, true);
  });
});
