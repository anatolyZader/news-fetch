import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  parsePboReviewDate,
  defaultBatchPath,
  buildBatchDocument,
  collectBatchRowQuestions,
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
      gaps: [{ id: 'narrative:missing_score', componentId: 'narrative', kind: 'missing_score' }],
      questions: [{ gapId: 'narrative:missing_score', componentId: 'narrative', text: 'Q?' }],
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
      gaps: [{ id: 'sparse_row', componentId: null, kind: 'sparse_row' }],
      questions: [{ gapId: 'sparse_row', componentId: null, text: 'Fill all' }],
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

  it('groups raw fields with critique and questions per component', () => {
    const raw = {
      A: { sourceFile: 'day.xlsx', components: { narrative: { name: 'נרטיב', avg: null, scores: [], texts: [] } } },
    };
    const batch = buildBatchDocument({
      date: '2026-07-26',
      reviews,
      lookupOfficer: (name) => officers[name] ?? null,
      lookupRawReport: (name) => raw[name] ?? null,
    });
    const a = batch.municipalities.find((m) => m.municipality === 'A');
    assert.equal(a.sourceFile, 'day.xlsx');
    assert.equal(a.components.narrative.name, 'נרטיב');
    assert.deepEqual(a.components.narrative.gaps.map((g) => g.id), ['narrative:missing_score']);
    assert.deepEqual(a.components.narrative.questions.map((q) => q.text), ['Q?']);
    assert.deepEqual(a.general, { gaps: [], questions: [] });

    const c = batch.municipalities.find((m) => m.municipality === 'C');
    assert.equal(c.sourceFile, null);
    assert.deepEqual(c.general.gaps.map((g) => g.id), ['sparse_row']);
    assert.deepEqual(c.general.questions.map((q) => q.text), ['Fill all']);
  });

  it('creates a placeholder component block when raw report is missing', () => {
    const batch = buildBatchDocument({
      date: '2026-07-26',
      reviews,
      lookupOfficer: (name) => officers[name] ?? null,
    });
    const a = batch.municipalities.find((m) => m.municipality === 'A');
    assert.equal(a.sourceFile, null);
    assert.equal(a.components.narrative.avg, null);
    assert.deepEqual(a.components.narrative.gaps.map((g) => g.id), ['narrative:missing_score']);
  });

  it('collectBatchRowQuestions flattens general first, then components; legacy rows pass through', () => {
    const row = {
      general: { questions: [{ gapId: 'locality', text: 'Where?' }] },
      components: { narrative: { questions: [{ gapId: 'narrative:missing_score', text: 'Q?' }] } },
    };
    assert.deepEqual(collectBatchRowQuestions(row).map((q) => q.text), ['Where?', 'Q?']);
    assert.deepEqual(collectBatchRowQuestions({ questions: [{ text: 'Legacy' }] }).map((q) => q.text), ['Legacy']);
    assert.equal(collectBatchRowQuestions({}), null);
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
