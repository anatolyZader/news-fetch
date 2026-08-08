import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLAIM_REF_NAMESPACES,
  classifyClaimRef,
  canonicalClaimRef,
  resolveClaimRef,
} from '../../../../../business_modules/resilience_scorer/domain/services/narrative/claimRefNamespace.js';
import { buildRefKey } from '../../../../../business_modules/resilience_scorer/domain/services/narrative/signalRefRegistry.js';

describe('claimRefNamespace — classification', () => {
  it('recognises every article-key scheme as the signal namespace', () => {
    for (const ref of [
      'shelter_use@idx:3',
      'shelter_use@url:https://example.com/a',
      'shelter_use@file:articles-2026-04-11.md#3',
      'shelter_use@src:pbo',
      'shelter_use@unknown',
    ]) {
      assert.equal(classifyClaimRef(ref).namespace, CLAIM_REF_NAMESPACES.SIGNAL, ref);
    }
  });

  it('separates open-observation, OOV and retrieval-chunk refs', () => {
    assert.equal(classifyClaimRef('open:obs-3').namespace, CLAIM_REF_NAMESPACES.OPEN_OBSERVATION);
    assert.equal(classifyClaimRef('oov:cluster-k1').namespace, CLAIM_REF_NAMESPACES.OOV);
    assert.equal(classifyClaimRef('archive:pbo:e48e772c').namespace, CLAIM_REF_NAMESPACES.CHUNK);
  });

  it('treats a bare-index ref as a legacy signal ref', () => {
    const parsed = classifyClaimRef('solidarity_help_others@1');
    assert.equal(parsed.namespace, CLAIM_REF_NAMESPACES.SIGNAL);
    assert.equal(parsed.legacy, true);
    assert.equal(parsed.articleKey, 'idx:1');
  });

  it('does not mistake a URL-bearing chunk id for a signal ref', () => {
    assert.equal(classifyClaimRef('report:2026-04-11:north:summary').namespace, CLAIM_REF_NAMESPACES.CHUNK);
  });
});

describe('claimRefNamespace — canonicalisation', () => {
  it('rewrites a legacy ref to the key buildRefKey produces', () => {
    const signal = { signal_type: 'solidarity_help_others', article_index: 1 };
    assert.equal(canonicalClaimRef('solidarity_help_others@1'), buildRefKey(signal));
  });

  it('leaves current and foreign refs untouched', () => {
    assert.equal(canonicalClaimRef('shelter_use@idx:3'), 'shelter_use@idx:3');
    assert.equal(canonicalClaimRef('open:obs-3'), 'open:obs-3');
  });
});

describe('claimRefNamespace — resolution', () => {
  const entry = { signal: { evidence: 'Neighbours organised transport.' } };
  const registry = { byRef: new Map([['solidarity_help_others@idx:1', entry]]) };

  it('resolves a legacy ref against a current registry', () => {
    const out = resolveClaimRef('solidarity_help_others@1', { registry });
    assert.equal(out.resolved, true);
    assert.equal(out.legacy, true);
    assert.equal(out.entry, entry);
  });

  it('reports a genuinely missing signal ref as unresolved', () => {
    const out = resolveClaimRef('shelter_use@idx:99', { registry });
    assert.equal(out.resolved, false);
    assert.equal(out.namespace, CLAIM_REF_NAMESPACES.SIGNAL);
  });

  it('does not report a foreign-namespace ref as a broken signal ref', () => {
    const out = resolveClaimRef('open:obs-3', { registry });
    assert.equal(out.namespace, CLAIM_REF_NAMESPACES.OPEN_OBSERVATION);
    assert.equal(out.resolved, false);

    const withStore = resolveClaimRef('open:obs-3', {
      registry,
      openObservationsByRef: new Map([['open:obs-3', { text: 'queue at clinic' }]]),
    });
    assert.equal(withStore.resolved, true);
  });
});
