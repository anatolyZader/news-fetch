import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createSourceArchive } from '../../../cross-cut-modules/source_archive/createSourceArchive.js';
import { archiveSocialFindings } from '../../../cross-cut-modules/source_archive/archiveSocialFindings.js';

describe('archiveSocialFindings', () => {
  let archive;
  let dbPath;

  beforeEach(() => {
    dbPath = join(tmpdir(), `social-archive-${process.pid}-${Date.now()}.sqlite`);
    archive = createSourceArchive(dbPath);
  });

  afterEach(() => {
    try { archive.close(); } catch { /* ignore */ }
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it('archives findings and returns id map', () => {
    const findings = [{
      id: 'f1',
      platform: 'telegram',
      quote_original: 'Shelter compliance was high today.',
      url: 'https://t.me/post/1',
      date: '2026-01-08',
    }];
    const { archived, idMap } = archiveSocialFindings(archive, findings, '2026-01-08');
    assert.equal(archived, 1);
    assert.ok(idMap.get('f1'));
    const row = archive.getBySourceId(idMap.get('f1'));
    assert.ok(row.body.includes('Shelter compliance'));
    assert.equal(row.source_type, 'social');
  });
});
