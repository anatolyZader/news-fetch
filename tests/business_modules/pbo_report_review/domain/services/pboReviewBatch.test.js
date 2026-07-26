import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  parsePboReviewDate,
  defaultBatchPath,
  buildBatchDocument,
  selectMunicipalitiesToSend,
} from '../../../../../business_modules/pbo_report_review/domain/services/pboReviewBatch.js';

describe('parsePboReviewDate', () => {
  it('accepts ISO dates', () => {
    assert.equal(parsePboReviewDate('2026-07-26'), '2026-07-26');
  });

  it('accepts dd:mm:yyyy', () => {
    assert.equal(parsePboReviewDate('26:07:2026'), '2026-07-26');
  });

  it('accepts dd/mm/yyyy', () => {
    assert.equal(parsePboReviewDate('1/7/2026'), '2026-07-01');
  });

  it('rejects invalid calendar dates', () => {
    assert.throws(() => parsePboReviewDate('32:01:2026'), /invalid/);
  });
});

describe('defaultBatchPath', () => {
  it('places batch under reviews/batches', () => {
    const p = defaultBatchPath('/repo', '2026-07-26');
    assert.equal(
      p,
      resolve('/repo', 'business_modules/pbo_report_review/data/reviews/batches/pbo-muni-review-2026-07-26.json'),
    );
  });
});

describe('buildBatchDocument + selectMunicipalitiesToSend', () => {
  const reviews = [
    {
      municipality: 'A',
      sufficient: false,
      status: 'open',
      gaps: [{ id: 'narrative:missing_score' }],
      questions: [{ gapId: 'narrative:missing_score', text: 'Q?' }],
      gapsHash: 'h1',
      language: 'he',
      emailSentAt: null,
    },
    {
      municipality: 'B',
      sufficient: true,
      status: 'resolved',
      gaps: [],
      questions: [],
      gapsHash: '',
      language: 'he',
      emailSentAt: null,
    },
    {
      municipality: 'C',
      sufficient: false,
      status: 'open',
      gaps: [{ id: 'sparse_row' }],
      questions: [{ gapId: 'sparse_row', text: 'Fill all' }],
      gapsHash: 'h2',
      language: 'he',
      emailSentAt: null,
    },
  ];

  const officers = {
    A: { email: 'a@example.com', language: 'he' },
    B: { email: 'b@example.com', language: 'he' },
    // C missing
  };

  it('sets send true only when incomplete and officer email present', () => {
    const batch = buildBatchDocument({
      date: '2026-07-26',
      reviews,
      lookupOfficer: (name) => officers[name] ?? null,
      generatedAt: '2026-07-26T12:00:00.000Z',
    });
    assert.equal(batch.summary.total, 3);
    assert.equal(batch.summary.sufficient, 1);
    assert.equal(batch.summary.needsFeedback, 2);
    assert.equal(batch.summary.missingOfficerEmail, 1);
    assert.equal(batch.municipalities.find((m) => m.municipality === 'A').send, true);
    assert.equal(batch.municipalities.find((m) => m.municipality === 'B').send, false);
    assert.equal(batch.municipalities.find((m) => m.municipality === 'C').send, false);
  });

  it('selectMunicipalitiesToSend respects send:false and sufficient', () => {
    const batch = buildBatchDocument({
      date: '2026-07-26',
      reviews,
      lookupOfficer: (name) => officers[name] ?? null,
    });
    batch.municipalities.find((m) => m.municipality === 'A').send = false;
    const selected = selectMunicipalitiesToSend(batch);
    assert.equal(selected.length, 0);
  });

  it('selectMunicipalitiesToSend includes incomplete with email', () => {
    const batch = buildBatchDocument({
      date: '2026-07-26',
      reviews,
      lookupOfficer: (name) => officers[name] ?? null,
    });
    const selected = selectMunicipalitiesToSend(batch);
    assert.deepEqual(selected.map((m) => m.municipality), ['A']);
  });
});
