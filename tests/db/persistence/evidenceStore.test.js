import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createEvidenceStore } from '../../../db/persistence/evidenceStore.js';

describe('evidenceStore', () => {
  /** @type {ReturnType<createEvidenceStore>} */
  let store;
  let dbPath;

  beforeEach(() => {
    dbPath = join(tmpdir(), `evidence-store-test-${process.pid}-${Date.now()}.sqlite`);
    store = createEvidenceStore(dbPath);
  });

  afterEach(() => {
    try {
      store.close();
    } catch {
      /* ignore */
    }
    try {
      if (existsSync(dbPath)) unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  // ── evidence_items ──────────────────────────────────────────────────────────

  describe('insertItems / getByDate', () => {
    it('inserts news items and retrieves by date', () => {
      const inserted = store.insertItems([
        { date: '2026-01-01', source_type: 'news', source_label: 'ynet', source_url: 'https://ynet.co.il/1', title: 'Article A', body: 'Body A', published_at: '2026-01-01' },
        { date: '2026-01-01', source_type: 'news', source_label: 'haaretz', source_url: 'https://haaretz.co.il/1', title: 'Article B', body: 'Body B', published_at: '2026-01-01' },
      ]);
      assert.equal(inserted, 2);

      const items = store.getByDate('2026-01-01');
      assert.equal(items.length, 2);
      assert.equal(items[0].source_type, 'news');
      assert.equal(items[0].title, 'Article A');
    });

    it('inserts audio items alongside news', () => {
      store.insertItems([
        { date: '2026-01-01', source_type: 'news', source_label: 'ynet', source_url: 'https://ynet.co.il/1', title: 'Article A', body: 'Body A', published_at: '2026-01-01' },
        { date: '2026-01-01', source_type: 'audio', source_label: 'YouTube — Test', source_url: 'https://youtube.com/watch?v=abc&t=42', title: 'Scene 1', body: 'Narrative', published_at: '2026-01-01' },
      ]);
      const items = store.getByDate('2026-01-01');
      const types = [...new Set(items.map(i => i.source_type))].sort();
      assert.deepEqual(types, ['audio', 'news']);
    });

    it('returns empty array for date with no items', () => {
      const items = store.getByDate('1999-01-01');
      assert.deepEqual(items, []);
    });

    it('does not return items from other dates', () => {
      store.insertItems([
        { date: '2026-01-01', source_type: 'news', source_url: 'https://ynet.co.il/1', title: 'Today', body: 'Body', published_at: '2026-01-01' },
        { date: '2026-01-02', source_type: 'news', source_url: 'https://ynet.co.il/2', title: 'Tomorrow', body: 'Body', published_at: '2026-01-02' },
      ]);
      const items = store.getByDate('2026-01-01');
      assert.equal(items.length, 1);
      assert.equal(items[0].title, 'Today');
    });
  });

  describe('deduplication', () => {
    it('ignores exact duplicate (same date + url + title)', () => {
      const item = { date: '2026-01-01', source_type: 'news', source_url: 'https://ynet.co.il/1', title: 'Article A', body: 'Body A' };
      store.insertItems([item]);
      const inserted = store.insertItems([item]);
      assert.equal(inserted, 0, 'duplicate should not be inserted');
    });

    it('allows same url on different dates', () => {
      const inserted = store.insertItems([
        { date: '2026-01-03', source_type: 'news', source_url: 'https://ynet.co.il/1', title: 'Article A', body: 'Body A' },
      ]);
      assert.equal(inserted, 1);
    });

    it('allows same title with different url', () => {
      const inserted = store.insertItems([
        { date: '2026-01-01', source_type: 'news', source_url: 'https://maariv.co.il/99', title: 'Article A', body: 'Different source' },
      ]);
      assert.equal(inserted, 1);
    });

    it('handles null url deduplication', () => {
      store.insertItems([{ date: '2026-01-04', source_type: 'audio', source_url: null, title: 'No URL scene', body: 'Body' }]);
      const second = store.insertItems([{ date: '2026-01-04', source_type: 'audio', source_url: null, title: 'No URL scene', body: 'Body' }]);
      assert.equal(second, 0);
    });
  });

  describe('hasItemsForDate', () => {
    it('returns true when items exist', () => {
      store.insertItems([
        { date: '2026-01-01', source_type: 'news', source_url: 'https://ynet.co.il/1', title: 'Article A', body: 'Body A' },
      ]);
      assert.equal(store.hasItemsForDate('2026-01-01'), true);
    });

    it('returns false for date with no items', () => {
      assert.equal(store.hasItemsForDate('1800-01-01'), false);
    });
  });

  // ── analysis_runs ───────────────────────────────────────────────────────────

  describe('saveRun / getLatestRunForDate', () => {
    it('returns null when no run exists for date', () => {
      assert.equal(store.getLatestRunForDate('1800-01-01'), null);
    });

    it('saves and retrieves a run', () => {
      store.saveRun({
        date: '2026-01-05',
        reportJson: { components: [{ id: 'narrative', score: 7 }] },
        sourceTypes: ['news', 'audio'],
        totalItems: 42,
        totalSignals: 18,
      });
      const run = store.getLatestRunForDate('2026-01-05');
      assert.ok(run);
      assert.deepEqual(run.sourceTypes, ['news', 'audio']);
      assert.equal(run.totalItems, 42);
      assert.equal(run.totalSignals, 18);
      assert.deepEqual(run.reportJson, { components: [{ id: 'narrative', score: 7 }] });
    });

    it('returns the most recent run when multiple exist', () => {
      store.saveRun({ date: '2026-01-05', reportJson: { version: 1 }, sourceTypes: ['news'], totalItems: 10, totalSignals: 3 });
      store.saveRun({ date: '2026-01-05', reportJson: { version: 2 }, sourceTypes: ['news', 'audio'], totalItems: 20, totalSignals: 8 });
      const run = store.getLatestRunForDate('2026-01-05');
      assert.equal(run.reportJson.version, 2);
    });

    it('run for one date does not appear for another', () => {
      store.saveRun({ date: '2026-01-05', reportJson: { version: 1 }, sourceTypes: ['news'], totalItems: 1, totalSignals: 1 });
      assert.equal(store.getLatestRunForDate('2026-01-06'), null);
    });
  });
});
