import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  skepticEnabled,
  skepticSampleSize,
  selectClaimsForSkeptic,
  applySkepticVerdicts,
} from '../../../business_modules/specialist_agents/domain/services/skepticPolicy.js';

function claim(id, text, refs) {
  return { claim_id: id, text, evidence_refs: refs };
}

function baseAssessment(overrides = {}) {
  return {
    component_id: 'leadership',
    severity: 'moderate',
    confidence: 'high',
    user_status: 'watch',
    narrative: 'Leadership guidance was issued.',
    claims: [
      claim('c1', 'Guidance was issued in one municipality.', ['leadership_signal@a1']),
      claim('c2', 'Guidance reached the whole northern population.', ['leadership_signal@a1', 'leadership_signal@a2']),
    ],
    ...overrides,
  };
}

describe('skepticPolicy gate', () => {
  const original = process.env.SKEPTIC_SAMPLE_SIZE;
  afterEach(() => {
    if (original === undefined) delete process.env.SKEPTIC_SAMPLE_SIZE;
    else process.env.SKEPTIC_SAMPLE_SIZE = original;
  });

  it('is off by default so the assessment path is unchanged until opted in', () => {
    delete process.env.SKEPTIC_SAMPLE_SIZE;
    assert.equal(skepticSampleSize(), 0);
    assert.equal(skepticEnabled(), false);
    assert.deepEqual(selectClaimsForSkeptic({ assessment: baseAssessment() }), []);
  });

  it('treats junk values as off rather than as the default', () => {
    for (const v of ['', 'yes', '-1', 'NaN']) {
      process.env.SKEPTIC_SAMPLE_SIZE = v;
      assert.equal(skepticEnabled(), false, `expected ${JSON.stringify(v)} to disable`);
    }
  });
});

describe('skepticPolicy selection', () => {
  it('skips work a verdict could not change: abstaining and low-confidence components', () => {
    assert.deepEqual(
      selectClaimsForSkeptic({ assessment: baseAssessment({ severity: 'abstain' }), sampleSize: 3 }),
      [],
    );
    assert.deepEqual(
      selectClaimsForSkeptic({ assessment: baseAssessment({ confidence: 'low' }), sampleSize: 3 }),
      [],
    );
  });

  it('leaves ref-less and already-dropped claims to the deterministic critic', () => {
    const assessment = baseAssessment({
      claims: [
        claim('c0', 'No refs at all.', []),
        { ...claim('c1', 'Already condemned.', ['x@1']), unsupported_drop: true },
        claim('c2', 'Live claim.', ['x@2']),
      ],
    });
    const selected = selectClaimsForSkeptic({ assessment, sampleSize: 5 });
    assert.deepEqual(selected.map((s) => s.claim.claim_id), ['c2']);
  });

  it('ranks thinnest support first and is stable across runs', () => {
    const assessment = baseAssessment({
      claims: [
        claim('c1', 'Three refs.', ['a@1', 'a@2', 'a@3']),
        claim('c2', 'One ref, long assertion about the whole population everywhere.', ['a@4']),
        claim('c3', 'One ref, short.', ['a@5']),
      ],
    });
    const first = selectClaimsForSkeptic({ assessment, sampleSize: 2 });
    const second = selectClaimsForSkeptic({ assessment, sampleSize: 2 });
    assert.deepEqual(first.map((s) => s.claim.claim_id), ['c2', 'c3']);
    assert.deepEqual(first.map((s) => s.claim.claim_id), second.map((s) => s.claim.claim_id));
  });

  it('halves the sample on a component the critic already failed', () => {
    const assessment = baseAssessment({
      claims: [claim('c1', 'a', ['a@1']), claim('c2', 'b', ['a@2']), claim('c3', 'c', ['a@3'])],
    });
    const selected = selectClaimsForSkeptic({
      assessment,
      criticVerdict: { passed: false },
      sampleSize: 3,
    });
    assert.equal(selected.length, 1);
  });
});

describe('skepticPolicy verdict application', () => {
  it('is subtractive only — a keep never raises confidence or adds claims', () => {
    const assessment = baseAssessment({ confidence: 'medium' });
    const { assessment: next, dropped } = applySkepticVerdicts(assessment, [
      { index: 0, verdict: 'keep', reason_code: 'evidence_supports' },
      { index: 1, verdict: 'keep', reason_code: 'evidence_supports' },
    ]);
    assert.equal(dropped, 0);
    assert.equal(next.confidence, 'medium');
    assert.equal(next.claims.length, 2);
    assert.equal(next.skeptic_checked, 2);
  });

  it('drops a rejected claim and downgrades high confidence', () => {
    const { assessment: next, dropped } = applySkepticVerdicts(baseAssessment(), [
      { index: 1, verdict: 'drop', reason_code: 'overstates_evidence', rationale: 'one municipality is not the north' },
    ]);
    assert.equal(dropped, 1);
    assert.deepEqual(next.claims.map((c) => c.claim_id), ['c1']);
    assert.equal(next.confidence, 'medium');
    const entry = next.repair_log.find((r) => r.issue === 'skeptic_rejected' && r.action === 'dropped_claim');
    assert.equal(entry.reason_code, 'overstates_evidence');
    assert.match(entry.rationale, /municipality/);
  });

  it('abstains rather than asserting on an empty evidence tree when every claim dies', () => {
    const { assessment: next } = applySkepticVerdicts(baseAssessment(), [
      { index: 0, verdict: 'drop', reason_code: 'evidence_unrelated' },
      { index: 1, verdict: 'drop', reason_code: 'overstates_evidence' },
    ]);
    assert.equal(next.claims.length, 0);
    assert.equal(next.severity, 'abstain');
    assert.equal(next.confidence, 'low');
    assert.equal(next.user_status, 'insufficient_data');
  });

  it('never deletes evidence on a verdict that is not an explicit drop', () => {
    // A skeptic that errored, timed out, or returned nothing must fail open.
    const { assessment: next, dropped } = applySkepticVerdicts(baseAssessment(), [
      { index: 0, verdict: 'keep', reason_code: 'skeptic_error' },
      { index: 1, verdict: undefined },
    ]);
    assert.equal(dropped, 0);
    assert.equal(next.claims.length, 2);
  });

  it('keeps evidence_tree in step with the dropped claims', () => {
    const assessment = baseAssessment({
      evidence_tree: [
        { claim_id: 'c1', text: 'kept' },
        { claim_id: 'c2', text: 'dropped' },
      ],
    });
    const { assessment: next } = applySkepticVerdicts(assessment, [
      { index: 1, verdict: 'drop', reason_code: 'overstates_evidence' },
    ]);
    assert.deepEqual(next.evidence_tree.map((c) => c.claim_id), ['c1']);
  });
});
