import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComponentNarrative,
  buildAbstentionNarrative,
  componentLabel,
  INSUFFICIENT_SYNTHESIS_NARRATIVE,
  shouldAllowTemplateNarrative,
} from '../../../../../business_modules/specialist_agents/domain/services/narrativeTemplates.js';

describe('narrativeTemplates', () => {
  it('labels a component id as readable English', () => {
    assert.equal(componentLabel('functional_continuity'), 'Functional continuity');
  });

  it('shouldAllowTemplateNarrative is true only when signal_count is zero', () => {
    assert.equal(shouldAllowTemplateNarrative({ signal_count: 0 }), true);
    assert.equal(shouldAllowTemplateNarrative({ signal_count: 4 }, 4), false);
  });

  it('operator view returns insufficient synthesis when signals exist', () => {
    const out = buildComponentNarrative({
      componentId: 'functional_continuity',
      ep: { signal_count: 12, source_diversity: 3 },
    });
    assert.equal(out, INSUFFICIENT_SYNTHESIS_NARRATIVE);
  });

  it('operator view does not emit template boilerplate for rich components', () => {
    const out = buildComponentNarrative({
      componentId: 'leadership',
      ep: {
        signal_count: 8,
        source_diversity: 1,
        dominance_warnings: [{ layer: 'source_type', key: 'pbo', message: 'pbo exceeds cap' }],
      },
    });
    assert.equal(out, INSUFFICIENT_SYNTHESIS_NARRATIVE);
    assert.doesNotMatch(out, /single evidence channel/);
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

  it('reports no signals when count is zero', () => {
    const out = buildComponentNarrative({ componentId: 'leadership', ep: { signal_count: 0 } });
    assert.match(out, /no substantive signals/);
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
