import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCOPE_MARKER_PREFIX,
  SCOPE_VIOLATION,
  checkComponentScopeSegregation,
  hasScopeMarker,
  isContextDerivedClaim,
  isScopeGateEnabled,
} from '../../../../../business_modules/resilience_scorer/domain/services/narrativeGrounding/scopeSegregation.js';

const CONTEXT_SIGNAL = {
  signal_type: 'early_warning_system_failure',
  signalProvenance: 'narrative_national_context',
  source_type: 'news',
  evidence: 'אזעקות נשמעו גם באשדוד ואשקלון ללא התרעה מקדימה',
};

const LOCAL_SIGNAL = {
  signal_type: 'information_clarity',
  signalProvenance: 'source_assigned',
  source_type: 'pbo',
  article_source: 'pbo-ראמה',
  evidence: 'התושבים מקבלים הנחיות מהמועצה',
};

function registryOf(map) {
  return { byRef: { get: (ref) => (map[ref] ? { signal: map[ref] } : null) } };
}

const REGISTRY = registryOf({
  'early_warning_system_failure@idx:54': CONTEXT_SIGNAL,
  'information_clarity@idx:29': LOCAL_SIGNAL,
});

describe('isContextDerivedClaim', () => {
  it('is true when every ref is out-of-scope context', () => {
    const claim = { text: 'x', signal_refs: ['early_warning_system_failure@idx:54'] };
    assert.equal(isContextDerivedClaim(claim, REGISTRY), true);
  });

  it('is false for a scope-local claim', () => {
    const claim = { text: 'x', signal_refs: ['information_clarity@idx:29'] };
    assert.equal(isContextDerivedClaim(claim, REGISTRY), false);
  });

  it('is false when the claim mixes local and context evidence', () => {
    // A comparison between here and elsewhere is a legitimate local finding —
    // only a claim with no local footing at all is about somewhere else.
    const claim = {
      text: 'x',
      signal_refs: ['information_clarity@idx:29', 'early_warning_system_failure@idx:54'],
    };
    assert.equal(isContextDerivedClaim(claim, REGISTRY), false);
  });

  it('is false when the claim has no refs or none resolve', () => {
    assert.equal(isContextDerivedClaim({ text: 'x', signal_refs: [] }, REGISTRY), false);
    assert.equal(isContextDerivedClaim({ text: 'x', signal_refs: ['nope@idx:1'] }, REGISTRY), false);
  });
});

describe('hasScopeMarker', () => {
  it('recognises the prefix the fallback emits', () => {
    assert.equal(hasScopeMarker(SCOPE_MARKER_PREFIX), true);
  });

  it('recognises the scope-named variants the polish prompt dictates', () => {
    assert.equal(hasScopeMarker('National press (not north-local evidence): sirens sounded.'), true);
    assert.equal(hasScopeMarker('Regional press (not north-local scored evidence): x.'), true);
  });

  it('rejects ordinary prose', () => {
    assert.equal(hasScopeMarker('Sirens are reported to have sounded in Ashdod.'), false);
  });
});

describe('checkComponentScopeSegregation', () => {
  const contextClaim = { text: 'sirens', signal_refs: ['early_warning_system_failure@idx:54'] };
  const localClaim = { text: 'guidance', signal_refs: ['information_clarity@idx:29'] };

  it('passes when a component has no out-of-scope claims', () => {
    const res = checkComponentScopeSegregation({
      prose: 'Municipal channels are functioning well.',
      claims: [localClaim],
      registry: REGISTRY,
    });
    assert.equal(res.ok, true);
    assert.equal(res.context_claim_count, 0);
  });

  it('flags the reported bug: out-of-scope claim written as a local finding', () => {
    const res = checkComponentScopeSegregation({
      prose: 'Structural deficiencies are documented. Sirens sounded in Ashdod and Ashkelon without advance warning.',
      claims: [localClaim, contextClaim],
      registry: REGISTRY,
    });
    assert.equal(res.ok, false);
    assert.deepEqual(res.violations, [SCOPE_VIOLATION.missing_marker]);
    assert.equal(res.context_claim_count, 1);
    assert.equal(res.marker_sentence_count, 0);
  });

  it('passes when the out-of-scope material sits behind the marker', () => {
    const res = checkComponentScopeSegregation({
      prose: 'Municipal channels are functioning. National press (not north-local evidence): sirens sounded in Ashdod.',
      claims: [localClaim, contextClaim],
      registry: REGISTRY,
    });
    assert.equal(res.ok, true);
    assert.equal(res.marker_sentence_count, 1);
  });

  it('flags context material left outside the marker', () => {
    const second = { text: 'unemployment', signal_refs: ['early_warning_system_failure@idx:54'] };
    const res = checkComponentScopeSegregation({
      prose: 'Sirens sounded in Ashdod. National press (not north-local evidence): unemployment payments advanced.',
      claims: [contextClaim, second],
      registry: REGISTRY,
    });
    assert.equal(res.ok, false);
    assert.deepEqual(res.violations, [SCOPE_VIOLATION.context_outside_marker]);
  });

  it('does not flag empty prose — there is nothing yet to segregate', () => {
    const res = checkComponentScopeSegregation({ prose: '', claims: [contextClaim], registry: REGISTRY });
    assert.equal(res.ok, true);
  });
});

describe('isScopeGateEnabled', () => {
  it('defaults on and honours the kill switch', () => {
    assert.equal(isScopeGateEnabled({}), true);
    assert.equal(isScopeGateEnabled({ RESILIENCE_NARRATIVE_SCOPE_GATE: '0' }), false);
  });
});
