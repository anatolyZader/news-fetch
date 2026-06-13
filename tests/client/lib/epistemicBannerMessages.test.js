import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveEpistemicBannerMessages,
  deriveEvidenceOverviewCounts,
} from '../../../client/src/lib/epistemicBannerMessages.js';

describe('deriveEpistemicBannerMessages', () => {
  it('does not show methodology epistemic banner for operator mode', () => {
    const msgs = deriveEpistemicBannerMessages({ components: [] }, { displayView: 'operator' });
    assert.ok(!msgs.some((m) => m.id === 'methodology:epistemic'));
  });

  it('does not show thin evidence warning when majority have thin evidence', () => {
    const assessment = {
      components: [
        { instrument: { evidence_sufficiency: 'thin' } },
        { instrument: { evidence_sufficiency: 'thin' } },
        { instrument: { evidence_sufficiency: 'adequate' } },
      ],
    };
    const msgs = deriveEpistemicBannerMessages(assessment, { displayView: 'operator' });
    assert.ok(!msgs.some((m) => m.id === 'methodology:thin_evidence'));
  });

  it('dedupes data void banner when attention item present', () => {
    const assessment = {
      data_void: { level: 'critical', digital_darkness: true },
      components: [],
    };
    const msgs = deriveEpistemicBannerMessages(assessment, {
      displayView: 'operator',
      attentionItemIds: ['data_void:critical'],
    });
    assert.ok(!msgs.some((m) => m.id === 'data_void:banner'));
  });
});

describe('deriveEvidenceOverviewCounts', () => {
  it('counts adequate thin contested and significant', () => {
    const counts = deriveEvidenceOverviewCounts({
      components: [
        { instrument: { evidence_sufficiency: 'adequate', significant_delta: true } },
        { instrument: { evidence_sufficiency: 'thin', contested: true } },
      ],
    });
    assert.equal(counts.total, 2);
    assert.equal(counts.adequate, 1);
    assert.equal(counts.thin, 1);
    assert.equal(counts.contested, 1);
    assert.equal(counts.significant, 1);
  });
});
