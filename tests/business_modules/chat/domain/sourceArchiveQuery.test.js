import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'os';
import { createSourceArchive } from '../../../../cross-cut-modules/source_archive/createSourceArchive.js';
import { searchSources, getSource, listSources } from '../../../../business_modules/chat/domain/sourceArchiveQuery.js';
import { buildArchiveSourceId } from '../../../../cross-cut-modules/source_archive/sourceId.js';

describe('sourceArchiveQuery', () => {
  let archive;
  let dbPath;

  beforeEach(() => {
    dbPath = join(tmpdir(), `archive-query-${process.pid}-${Date.now()}.sqlite`);
    archive = createSourceArchive(dbPath);
    const sid = buildArchiveSourceId({
      source_type: 'news',
      date: '2026-02-01',
      source_url: 'https://example.com/a',
      title: 'Shelter story',
    });
    archive.upsert({
      source_id: sid,
      date: '2026-02-01',
      source_type: 'news',
      source_url: 'https://example.com/a',
      title: 'Shelter story',
      body: 'Residents entered public shelters during the alert.',
      published_at: '2026-02-01',
    });
  });

  afterEach(() => {
    try { archive.close(); } catch { /* ignore */ }
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it('searchSources finds archived row', async () => {
    const out = await searchSources({ date: '2026-02-01', query: 'shelter' }, archive);
    assert.match(out, /source_id=/);
    assert.match(out, /Shelter story/);
  });

  it('listSources browses by date and source_type', () => {
    archive.upsert({
      source_id: buildArchiveSourceId({
        source_type: 'pbo',
        date: '2026-02-01',
        title: 'Haifa PBO',
        body: 'Observer notes for Haifa.',
      }),
      date: '2026-02-01',
      source_type: 'pbo',
      title: 'Haifa PBO',
      body: 'Observer notes for Haifa.',
    });
    const out = listSources({ date: '2026-02-01', source_type: 'pbo' }, archive);
    assert.match(out, /Haifa PBO/);
  });

  it('getSource returns full body', async () => {
    const sid = buildArchiveSourceId({
      source_type: 'news',
      date: '2026-02-01',
      source_url: 'https://example.com/a',
      title: 'Shelter story',
    });
    const out = await getSource({ source_id: sid }, archive);
    assert.match(out, /public shelters/);
  });
});
