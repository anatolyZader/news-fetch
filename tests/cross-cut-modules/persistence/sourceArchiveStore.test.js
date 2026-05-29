import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createSourceArchiveStore } from '../../../cross-cut-modules/persistence/sourceArchiveStore.js';
import { buildMdSourceId, buildArchiveSourceId } from '../../../cross-cut-modules/source_archive/sourceId.js';

describe('sourceArchiveStore', () => {
  /** @type {ReturnType<createSourceArchiveStore>} */
  let store;
  let dbPath;

  beforeEach(() => {
    dbPath = join(tmpdir(), `source-archive-test-${process.pid}-${Date.now()}.sqlite`);
    store = createSourceArchiveStore(dbPath);
  });

  afterEach(() => {
    try {
      store.close();
    } catch { /* ignore */ }
    try {
      if (existsSync(dbPath)) unlinkSync(dbPath);
    } catch { /* ignore */ }
  });

  it('upserts and retrieves by source_id', () => {
    const sid = buildMdSourceId('business_modules/news-sites/articles_extracted/articles-homefront-2026-01-01.md', 1);
    store.upsert({
      source_id: sid,
      date: '2026-01-01',
      source_type: 'news',
      source_label: 'ynet',
      source_url: 'https://ynet.co.il/1',
      title: 'Article A',
      body: 'Full body text here.',
      published_at: '2026-01-01',
    });
    const row = store.getBySourceId(sid);
    assert.ok(row);
    assert.equal(row.title, 'Article A');
    assert.equal(row.body, 'Full body text here.');
  });

  it('replaces row on upsert with same source_id', () => {
    const sid = buildArchiveSourceId({
      source_type: 'whatsapp',
      date: '2026-01-02',
      source_url: 'https://example.com/wa',
      title: 'msg',
      body: 'v1',
    });
    store.upsert({
      source_id: sid,
      date: '2026-01-02',
      source_type: 'whatsapp',
      source_url: 'https://example.com/wa',
      title: 'msg',
      body: 'v1',
    });
    store.upsert({
      source_id: sid,
      date: '2026-01-02',
      source_type: 'whatsapp',
      source_url: 'https://example.com/wa',
      title: 'msg',
      body: 'v2 updated',
    });
    const row = store.getBySourceId(sid);
    assert.equal(row.body, 'v2 updated');
  });

  it('search filters by query and source_type', () => {
    store.upsert({
      source_id: buildMdSourceId('a.md', 1),
      date: '2026-01-03',
      source_type: 'news',
      title: 'Shelter compliance',
      body: 'Residents entered shelters quickly.',
      source_url: 'https://a/1',
    });
    store.upsert({
      source_id: buildMdSourceId('a.md', 2),
      date: '2026-01-03',
      source_type: 'radio',
      title: 'Weather',
      body: 'Rain expected.',
      source_url: 'https://a/2',
    });
    const hits = store.search({
      date: '2026-01-03',
      query: 'shelter',
      source_type: 'news',
      limit: 5,
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].title, 'Shelter compliance');
    assert.ok(hits[0].snippet.includes('shelter'));
  });

  it('search allows query-less when source_type is set', () => {
    store.upsert({
      source_id: buildMdSourceId('b.md', 1),
      date: '2026-01-04',
      source_type: 'pbo',
      title: 'Haifa PBO',
      body: 'Observer notes.',
    });
    const hits = store.search({
      date: '2026-01-04',
      source_type: 'pbo',
      limit: 5,
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].source_type, 'pbo');
  });

  it('listByDateRange filters by type and date span', () => {
    store.upsert({
      source_id: buildMdSourceId('c.md', 1),
      date: '2026-01-05',
      source_type: 'naftali',
      body: 'week1',
    });
    store.upsert({
      source_id: buildMdSourceId('c.md', 2),
      date: '2026-01-07',
      source_type: 'naftali',
      body: 'week2',
    });
    store.upsert({
      source_id: buildMdSourceId('c.md', 3),
      date: '2026-01-07',
      source_type: 'news',
      body: 'news',
    });
    const rows = store.listByDateRange({
      date_from: '2026-01-05',
      date_to: '2026-01-07',
      source_type: 'naftali',
    });
    assert.equal(rows.length, 2);
  });

  it('purgeEphemeralBeforeDate deletes only news/radio/social before cutoff', () => {
    store.upsert({
      source_id: buildMdSourceId('old-news.md', 1),
      date: '2026-01-01',
      source_type: 'news',
      body: 'old news',
    });
    store.upsert({
      source_id: buildMdSourceId('old-field.md', 1),
      date: '2026-01-01',
      source_type: 'field',
      body: 'old field visit',
    });
    store.upsert({
      source_id: buildMdSourceId('new-news.md', 1),
      date: '2026-01-10',
      source_type: 'news',
      body: 'new',
    });
    const { deleted, types } = store.purgeEphemeralBeforeDate('2026-01-05');
    assert.equal(deleted, 1);
    assert.deepEqual(types, ['news', 'radio', 'social']);
    assert.equal(store.listByDate('2026-01-01').length, 1);
    assert.equal(store.listByDate('2026-01-01')[0].source_type, 'field');
    assert.equal(store.listByDate('2026-01-10').length, 1);
  });
});
