import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildActionCompass } from '../../../../../business_modules/resilience/domain/services/actionCompass.js';
import { buildAttentionItems } from '../../../../../business_modules/resilience/domain/services/attentionItems.js';

describe('buildActionCompass', () => {
  it('returns field corroboration for abstained assessment without scores', () => {
    const assessment = {
      assessment_mode: 'abstained',
      epistemic_status: { sampling_status: 'blind', assessment_mode: 'abstained' },
      data_void: { level: 'critical', digital_darkness: true },
      components: [{
        component_id: 'lifesaving_behavior',
        instrument: { operator_shows_score: false, thin_evidence_instrument: 'sampling_blind' },
      }],
    };
    const attention = buildAttentionItems(assessment, { view: 'operator' });
    const compass = buildActionCompass(assessment, attention);
    assert.ok(compass);
    assert.equal(compass.uncertainty_band, 'critical');
    assert.ok(compass.actions.some((a) => a.id === 'compass:void:field'));
    const blob = JSON.stringify(compass);
    assert.doesNotMatch(blob, /"score":\s*[0-9]/);
    assert.doesNotMatch(blob, /\/10/);
  });

  it('returns null when no actions and band unknown', () => {
    const assessment = {
      assessment_mode: 'normal',
      epistemic_status: { sampling_status: 'normal' },
      components: [{ component_id: 'narrative', instrument: { operator_shows_score: true } }],
    };
    const compass = buildActionCompass(assessment, []);
    assert.equal(compass, null);
  });
});
