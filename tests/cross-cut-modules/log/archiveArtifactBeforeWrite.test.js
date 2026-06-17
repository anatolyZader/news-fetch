import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveArtifactBeforeWrite } from '../../../cross-cut-modules/log/app/archiveArtifactBeforeWrite.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'bundle-archive-'));

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('archiveArtifactBeforeWrite', () => {
  it('copies existing bundle to archive/ and leaves original in place until caller overwrites', () => {
    const target = join(tmpDir, 'signals-news-2026-04-15.json');
    writeFileSync(target, '{"old":true}', 'utf8');

    const archived = archiveArtifactBeforeWrite(target);
    assert.ok(archived);
    assert.match(archived, /archive\/signals-news-2026-04-15-/);
    assert.equal(existsSync(target), true);
    assert.equal(readFileSync(target, 'utf8'), '{"old":true}');
    assert.equal(readFileSync(archived, 'utf8'), '{"old":true}');
  });

  it('returns null when target does not exist', () => {
    const target = join(tmpDir, 'missing.json');
    assert.equal(archiveArtifactBeforeWrite(target), null);
  });
});
