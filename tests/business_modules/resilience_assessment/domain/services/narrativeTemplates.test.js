import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComponentNarrative,
  buildAbstentionNarrative,
  componentLabel,
} from '../../../../../business_modules/resilience_assessment/domain/services/narrativeTemplates.js';

describe('narrativeTemplates', () => {
  it('labels a component id as readable English', () => {
    assert.equal(componentLabel('functional_continuity'), 'Functional continuity');
  });

  it('operator narrative is qualitative: names the component but no slug or raw counts', () => {
    const out = buildComponentNarrative({
      componentId: 'functional_continuity',
      ep: { signal_count: 12, source_diversity: 3 },
    });
    assert.match(out, /Functional continuity/);
    assert.match(out, /multiple evidence channels/);
    assert.doesNotMatch(out, /12 signal\(s\)|signal\(s\)/);
    assert.doesNotMatch(out, /source types/);
  });

  it('operator narrative flags single-channel concentration qualitatively (no source_type slug)', () => {
    const out = buildComponentNarrative({
      componentId: 'leadership',
      ep: {
        signal_count: 8,
        dominance_warnings: [{ layer: 'source_type', key: 'pbo', message: 'pbo exceeds cap' }],
      },
    });
    assert.match(out, /single evidence channel/);
    assert.match(out, /provisional/);
    assert.doesNotMatch(out, /\(pbo\)/);
    assert.doesNotMatch(out, /%/);
    assert.doesNotMatch(out, /mass cap/);
    assert.doesNotMatch(out, /signal\(s\)/);
  });

  it('analyst view may name the source family and counts', () => {
    const out = buildComponentNarrative({
      componentId: 'leadership',
      view: 'analyst',
      ep: {
        signal_count: 8,
        dominance_warnings: [{ layer: 'source_type', key: 'pbo', message: 'pbo exceeds cap' }],
      },
    });
    assert.match(out, /single source family \(pbo\)/);
    assert.match(out, /8 signal\(s\)/);
  });

  it('flags contested and thin evidence', () => {
    const out = buildComponentNarrative({
      componentId: 'narrative',
      ep: { signal_count: 4, contested: true, thin_evidence: true },
    });
    assert.match(out, /thin and contested/);
    assert.match(out, /provisional/);
  });

  it('reports no signals when count is zero', () => {
    const out = buildComponentNarrative({ componentId: 'leadership', ep: { signal_count: 0 } });
    assert.match(out, /no substantive signals/);
  });

  it('does not inline raw evidence markers', () => {
    const out = buildComponentNarrative({
      componentId: 'narrative',
      ep: { signal_count: 5 },
      claimCount: 5,
    });
    assert.doesNotMatch(out, /evidence_refs|sig:|http/);
  });

  it('builds an abstention narrative that mentions corroboration when thin', () => {
    const out = buildAbstentionNarrative('community_capital', { thin_evidence: true });
    assert.match(out, /community capital/);
    assert.match(out, /abstained/);
    assert.match(out, /corroboration/);
  });

  it('builds a plain abstention narrative when not thin', () => {
    const out = buildAbstentionNarrative('leadership', {});
    assert.match(out, /Assessment abstained for leadership/);
  });
});
