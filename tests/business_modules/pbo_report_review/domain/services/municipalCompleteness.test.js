import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMunicipalGaps,
  buildQuestionsFromGaps,
  computeGapsHash,
  deriveReviewStatus,
  GAP_KINDS,
  reviewMunicipalityRow,
} from '../../../../../business_modules/pbo_report_review/domain/services/municipalCompleteness.js';
import { COMPONENTS_ORDER } from '../../../../../business_modules/pbo_report_muni/app/pboMunicipalityService.js';
import { EVIDENCE_REQUIREMENTS } from '../../../../../business_modules/report_build/domain/evidenceRequirements.js';

function makeMuni(overrides = {}) {
  const components = {};
  for (const cid of COMPONENTS_ORDER) {
    components[cid] = { scores: [], texts: [], avg: null, ...overrides[cid] };
  }
  return { name: 'Test Muni', components };
}

describe('municipalCompleteness', () => {
  it('detects missing score, missing verbal text, and thin officer coverage', () => {
    const muni = makeMuni({
      narrative: { avg: 0.6, scores: [{ value: 0.6 }], texts: [] },
      information_communication: { avg: null, scores: [], texts: [] },
    });
    for (const cid of COMPONENTS_ORDER) {
      if (cid === 'narrative' || cid === 'information_communication') continue;
      muni.components[cid] = { avg: 0.5, scores: [{ value: 0.5 }, { value: 0.5 }, { value: 0.5 }], texts: ['ok'] };
    }

    const { sufficient, gaps } = computeMunicipalGaps(muni, COMPONENTS_ORDER);
    assert.equal(sufficient, false);
    assert.ok(gaps.some((g) => g.kind === GAP_KINDS.missing_score));
    assert.ok(gaps.some((g) => g.kind === GAP_KINDS.missing_verbal_text && g.componentId === 'narrative'));
    assert.ok(gaps.some((g) => g.kind === GAP_KINDS.thin_officer_coverage && g.componentId === 'narrative'));
  });

  it('is sufficient when all components have scores, text, and 3+ officer scores', () => {
    const muni = makeMuni();
    for (const cid of COMPONENTS_ORDER) {
      muni.components[cid] = {
        avg: 0.7,
        scores: [{ value: 0.7 }, { value: 0.7 }, { value: 0.7 }],
        texts: ['verbal'],
      };
    }
    const { sufficient, gaps } = computeMunicipalGaps(muni, COMPONENTS_ORDER);
    assert.equal(sufficient, true);
    assert.equal(gaps.length, 0);
  });

  it('builds questions from gaps in Hebrew', () => {
    const gaps = [{ id: 'narrative:missing_verbal_text', componentId: 'narrative', kind: GAP_KINDS.missing_verbal_text }];
    const questions = buildQuestionsFromGaps(
      gaps,
      EVIDENCE_REQUIREMENTS,
      { he: { narrative: 'נרטיב' }, en: { narrative: 'Narrative' } },
      'he',
    );
    assert.equal(questions.length, 1);
    assert.match(questions[0].text, /סיפור|נרטיב|תושבים/);
  });

  it('computeGapsHash is stable', () => {
    const gaps = [
      { id: 'a:missing_score', componentId: 'a', kind: GAP_KINDS.missing_score },
      { id: 'b:missing_score', componentId: 'b', kind: GAP_KINDS.missing_score },
    ];
    assert.equal(computeGapsHash(gaps), computeGapsHash([...gaps].reverse()));
  });

  it('deriveReviewStatus resolves missing_verbal_text when supplemental text exists', () => {
    const gaps = [{ id: 'narrative:missing_verbal_text', componentId: 'narrative', kind: GAP_KINDS.missing_verbal_text }];
    assert.equal(deriveReviewStatus(gaps, { narrative: 'filled in' }), 'resolved');
  });

  it('reviewMunicipalityRow returns questions when insufficient', () => {
    const muni = makeMuni({
      narrative: { avg: 0.5, scores: [{ value: 0.5 }], texts: [] },
    });
    for (const cid of COMPONENTS_ORDER) {
      if (cid === 'narrative') continue;
      muni.components[cid] = { avg: 0.5, scores: [{ value: 0.5 }, { value: 0.5 }, { value: 0.5 }], texts: ['x'] };
    }
    const result = reviewMunicipalityRow(
      muni,
      COMPONENTS_ORDER,
      EVIDENCE_REQUIREMENTS,
      { he: {}, en: {} },
      'he',
    );
    assert.equal(result.sufficient, false);
    assert.ok(result.questions.length >= 1);
  });
});
