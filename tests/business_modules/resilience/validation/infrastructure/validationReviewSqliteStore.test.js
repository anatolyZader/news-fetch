import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createValidationReviewSqliteStore } from '../../../../../business_modules/resilience/validation/infrastructure/adapters/validationReviewSqliteStore.js';

describe('validationReviewSqliteStore', () => {
  let dir;
  let dbPath;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'validation-review-'));
    dbPath = join(dir, 'test.sqlite');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('upserts queue items and lists pending', () => {
    const store = createValidationReviewSqliteStore(dbPath);
    store.upsertQueueItems('2026-05-28', 'national', [
      {
        article_key: 'url:https://example.com/a',
        queue_rank: 1,
        priority: 10,
        review_status: 'pending',
        article_url: 'https://example.com/a',
        reasons: [{ code: 'significant_delta' }],
        signals: [],
        signal_types: ['panic_rumor'],
        component_ids: ['narrative'],
      },
    ], { catalog_version: 'v1' });

    const items = store.listItems('2026-05-28', 'national', { status: 'pending' });
    assert.equal(items.length, 1);
    assert.equal(items[0].article_key, 'url:https://example.com/a');
  });

  it('updates status and preserves done items on re-upsert', () => {
    const store = createValidationReviewSqliteStore(dbPath);
    const key = 'url:https://example.com/b';
    store.upsertQueueItems('2026-05-28', 'national', [
      { article_key: key, queue_rank: 1, priority: 5, review_status: 'pending' },
    ]);
    store.updateItemStatus('2026-05-28', 'national', key, 'skipped');
    store.upsertQueueItems('2026-05-28', 'national', [
      { article_key: key, queue_rank: 1, priority: 8, review_status: 'pending' },
    ]);
    const item = store.getItem('2026-05-28', 'national', key);
    assert.equal(item.review_status, 'skipped');
  });

  it('getLatestDecision returns most recent action', () => {
    const store = createValidationReviewSqliteStore(dbPath);
    const key = '__epistemic__:social_channel_quarantine';
    store.appendDecision({
      date: '2026-05-28',
      scope: 'national',
      article_key: key,
      reviewerEmail: 'a@test.com',
      action: 'dismiss_social_quarantine',
      payload: {},
    });
    store.appendDecision({
      date: '2026-05-28',
      scope: 'national',
      article_key: key,
      reviewerEmail: 'b@test.com',
      action: 'confirm_social_quarantine',
      payload: { note: 'yes' },
    });
    const latest = store.getLatestDecision('2026-05-28', 'national', key);
    assert.equal(latest?.action, 'confirm_social_quarantine');
  });
});
