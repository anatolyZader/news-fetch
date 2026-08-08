import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  pboCompletenessLabel,
  reviewMetadataEntry,
  PBO_REVIEW_STATE,
} from '../../../../../business_modules/pbo_report_review/domain/services/reviewSupplementalTexts.js';

describe('pboCompletenessLabel', () => {
  it('reports unreviewed when there is no review row at all', () => {
    // Distinct from reviewed_incomplete: nobody having looked is not a verdict.
    assert.equal(pboCompletenessLabel(null), PBO_REVIEW_STATE.unreviewed);
    assert.equal(pboCompletenessLabel(undefined), PBO_REVIEW_STATE.unreviewed);
  });

  it('reports reviewed_incomplete for an open, insufficient review', () => {
    assert.equal(
      pboCompletenessLabel({ sufficient: false, status: 'open' }),
      PBO_REVIEW_STATE.reviewed_incomplete,
    );
  });

  it('reports reviewed_sufficient when marked sufficient or resolved', () => {
    assert.equal(pboCompletenessLabel({ sufficient: true }), PBO_REVIEW_STATE.reviewed_sufficient);
    assert.equal(pboCompletenessLabel({ status: 'resolved' }), PBO_REVIEW_STATE.reviewed_sufficient);
  });
});

describe('reviewMetadataEntry', () => {
  it('emits the review state and keeps evidence_thin aligned with it', () => {
    const entry = reviewMetadataEntry({ sufficient: false, status: 'open' }, { narrative: 'more detail' });
    assert.equal(entry.pbo_review_state, PBO_REVIEW_STATE.reviewed_incomplete);
    assert.equal(entry.pbo_review_status, 'open');
    assert.equal(entry.pbo_evidence_thin, true);
    assert.deepEqual(entry.supplementalTexts, { narrative: 'more detail' });
  });

  it('does not mark a sufficient review as thin', () => {
    const entry = reviewMetadataEntry({ sufficient: true, status: 'open' }, {});
    assert.equal(entry.pbo_review_state, PBO_REVIEW_STATE.reviewed_sufficient);
    assert.equal(entry.pbo_evidence_thin, false);
  });
});
