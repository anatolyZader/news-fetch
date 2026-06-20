import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSpecialistTier,
  maxRoundsForTier,
} from '../../../business_modules/resilience_assessment/domain/services/specialistTier.js';

describe('specialistTier', () => {
  const baseEp = {
    by_component: {
      leadership: { contested: false, delta_significance: 'LOW', evidence_mass: 5 },
      functional_continuity: { contested: true, delta_significance: 'LOW', evidence_mass: 4 },
    },
  };

  it('returns C when abstain', () => {
    assert.equal(resolveSpecialistTier({
      componentId: 'leadership',
      epistemicProfile: baseEp,
      abstain: true,
    }), 'C');
  });

  it('returns A on contested component', () => {
    assert.equal(resolveSpecialistTier({
      componentId: 'functional_continuity',
      epistemicProfile: baseEp,
      plan: { focus_components: ['functional_continuity'] },
    }), 'A');
  });

  it('returns A on media anomaly for component', () => {
    assert.equal(resolveSpecialistTier({
      componentId: 'leadership',
      epistemicProfile: baseEp,
      plannerContext: {
        media_volume_anomalies: [{ component_id: 'leadership' }],
      },
      plan: { focus_components: ['leadership'] },
    }), 'A');
  });

  it('returns B for focus component without tier-A triggers', () => {
    assert.equal(resolveSpecialistTier({
      componentId: 'leadership',
      epistemicProfile: baseEp,
      plan: { focus_components: ['leadership'] },
    }), 'B');
  });

  it('returns C when not in focus and no triggers', () => {
    assert.equal(resolveSpecialistTier({
      componentId: 'leadership',
      epistemicProfile: baseEp,
      plan: { focus_components: ['functional_continuity'] },
    }), 'C');
  });

  it('returns A for regional report scope', () => {
    assert.equal(resolveSpecialistTier({
      componentId: 'leadership',
      epistemicProfile: baseEp,
      plan: { focus_components: ['functional_continuity'] },
      reportScopeId: 'north',
    }), 'A');
  });

  it('returns A when totalScopedSignals exceeds 50', () => {
    assert.equal(resolveSpecialistTier({
      componentId: 'leadership',
      epistemicProfile: baseEp,
      plan: { focus_components: ['functional_continuity'] },
      reportScopeId: 'national',
      totalScopedSignals: 51,
    }), 'A');
  });

  it('returns B for investigation-eligible component outside focus', () => {
    const ep = {
      by_component: {
        information_communication: {
          contested: false,
          delta_significance: 'LOW',
          evidence_mass: 57,
          investigation_eligible: true,
        },
      },
    };
    assert.equal(resolveSpecialistTier({
      componentId: 'information_communication',
      epistemicProfile: ep,
      plan: { focus_components: ['narrative'] },
    }), 'B');
  });

  it('maxRoundsForTier maps A/B/C', () => {
    assert.equal(maxRoundsForTier('A'), 3);
    assert.equal(maxRoundsForTier('B'), 1);
    assert.equal(maxRoundsForTier('C'), 0);
  });
});
