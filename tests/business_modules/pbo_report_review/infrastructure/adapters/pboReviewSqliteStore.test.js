import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPboReviewSqliteStore } from '../../../../../business_modules/pbo_report_review/infrastructure/adapters/pboReviewSqliteStore.js';

describe('pboReviewSqliteStore', () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let dbPath;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pbo-review-'));
    dbPath = join(dir, 'test.sqlite');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('upserts review and enforces idempotent gaps hash', () => {
    const store = createPboReviewSqliteStore(dbPath);
    const first = store.upsertReview({
      date: '2026-05-28',
      municipality: 'מטה',
      file: 'north_28_5.xlsx',
      sufficient: false,
      gaps: [{ id: 'narrative:missing_verbal_text', componentId: 'narrative', kind: 'missing_verbal_text' }],
      questions: [{ gapId: 'narrative:missing_verbal_text', text: 'שאלה?' }],
      gapsHash: 'abc123',
      language: 'he',
      status: 'open',
    });
    assert.ok(first.reviewToken);

    store.upsertReview({
      date: '2026-05-28',
      municipality: 'מטה',
      file: 'north_28_5.xlsx',
      sufficient: false,
      gaps: [{ id: 'narrative:missing_verbal_text', componentId: 'narrative', kind: 'missing_verbal_text' }],
      questions: [{ gapId: 'narrative:missing_verbal_text', text: 'שאלה?' }],
      gapsHash: 'abc123',
      emailSentAt: '2026-05-28T10:00:00.000Z',
      emailMessageId: 'msg-1',
      language: 'he',
      status: 'open',
    });

    const loaded = store.getReview('2026-05-28', 'מטה');
    assert.equal(loaded.reviewToken, first.reviewToken);
    assert.equal(loaded.emailMessageId, 'msg-1');
  });

  it('stores and lists replies', () => {
    const store = createPboReviewSqliteStore(dbPath);
    store.upsertReview({
      date: '2026-05-28',
      municipality: 'X',
      file: 'f.xlsx',
      sufficient: false,
      gaps: [],
      questions: [],
      gapsHash: 'h1',
      language: 'en',
      status: 'open',
    });
    store.addReply({
      date: '2026-05-28',
      municipality: 'X',
      channel: 'web',
      answers: [{ gapId: 'narrative:missing_verbal_text', text: 'answer' }],
      rawText: '',
    });
    const replies = store.listReplies('2026-05-28', 'X');
    assert.equal(replies.length, 1);
    assert.equal(replies[0].channel, 'web');
  });

  it('finds review by token', () => {
    const store = createPboReviewSqliteStore(dbPath);
    const review = store.upsertReview({
      date: '2026-05-28',
      municipality: 'Y',
      file: 'f.xlsx',
      sufficient: true,
      gaps: [],
      questions: [],
      gapsHash: 'h2',
      language: 'he',
      status: 'resolved',
    });
    const byToken = store.getReviewByToken(review.reviewToken);
    assert.equal(byToken.municipality, 'Y');
  });
});
