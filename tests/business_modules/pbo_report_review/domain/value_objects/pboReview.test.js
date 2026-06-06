import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PboReview } from '../../../../../business_modules/pbo_report_review/domain/value_objects/pboReview.js';

describe('PboReview VO', () => {
  it('derives status from completeness gaps', () => {
    const review = PboReview.fromCompleteness('2026-01-01', 'TestCity', { gaps: [] });
    assert.equal(review.municipality, 'TestCity');
    assert.equal(typeof review.status, 'string');
  });

  it('tracks email sent invariant', () => {
    const review = new PboReview({
      date: '2026-01-01',
      municipality: 'A',
      status: 'incomplete',
    });
    assert.equal(review.canSendEmail(), true);
    const sent = review.withEmailSent();
    assert.equal(sent.canSendEmail(), false);
  });
});
