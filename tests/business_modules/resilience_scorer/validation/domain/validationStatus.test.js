import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { DEFAULT_VALIDATION_CONFIG } from '../../../../../business_modules/resilience_scorer/validation/config/validationConfig.js';
import { summarizeValidationMaturity } from '../../../../../business_modules/resilience_scorer/validation/domain/validationStatus.js';

describe('validationStatus', () => {
  it('summarizeValidationMaturity reports empty collection state', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'validation-status-'));
    const summary = summarizeValidationMaturity({
      rootDir,
      config: { ...DEFAULT_VALIDATION_CONFIG },
    });
    assert.equal(summary.collection.record_count, 0);
    assert.equal(summary.review_queue.pending, 0);
    assert.equal(summary.tier_readiness.tier3_tuning.status, 'collecting');
    assert.ok(summary.next_actions.some((a) => a.includes('assess-signals')));
  });

  it('summarizeValidationMaturity counts records and pending review items', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'validation-status-'));
    const recordsDir = join(
      rootDir,
      'business_modules/resilience_scorer/validation/artifacts/records',
    );
    const reviewDir = join(
      rootDir,
      'business_modules/resilience_scorer/validation/artifacts/review-queue',
    );
    mkdirSync(recordsDir, { recursive: true });
    mkdirSync(reviewDir, { recursive: true });

    writeFileSync(
      join(recordsDir, '2026-05-23-national.json'),
      JSON.stringify({
        date: '2026-05-23',
        scope: 'national',
        components: [{ component_id: 'services', expert_labels: [{ score: 7 }] }],
      }),
    );
    writeFileSync(
      join(reviewDir, '2026-05-23.json'),
      JSON.stringify({
        items: [
          { review_status: 'pending' },
          { review_status: 'done' },
        ],
      }),
    );

    const summary = summarizeValidationMaturity({
      rootDir,
      config: { ...DEFAULT_VALIDATION_CONFIG },
    });

    assert.equal(summary.collection.record_count, 1);
    assert.equal(summary.collection.distinct_dates, 1);
    assert.deepEqual(summary.collection.scopes, ['national']);
    assert.equal(summary.review_queue.pending, 1);
    assert.equal(summary.tier_readiness.tier4_construct.collection_days, 1);
    assert.ok(summary.next_actions.some((a) => a.includes('Review 1 pending')));
  });
});
