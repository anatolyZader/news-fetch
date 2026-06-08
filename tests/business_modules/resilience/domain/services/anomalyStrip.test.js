import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnomalyStrip, isCrisisEpistemicMode } from '../../../../../business_modules/resilience/domain/services/anomalyStrip.js';

describe('buildAnomalyStrip', () => {
  it('shows operator strip in crisis mode with single cluster', () => {
    const assessment = {
      assessment_mode: 'abstained',
      epistemic_status: { sampling_status: 'blind' },
      oov_burst: {
        alert: false,
        top_clusters: [{ cluster_key: 'help', count: 2, keywords: ['help'] }],
      },
      components: [],
    };
    assert.equal(isCrisisEpistemicMode(assessment), true);
    const strip = buildAnomalyStrip(assessment);
    assert.ok(strip);
    assert.equal(strip.show_operator, true);
    assert.ok(strip.clusters.length >= 1);
  });

  it('includes salience critical components', () => {
    const strip = buildAnomalyStrip({
      components: [{
        component_id: 'lifesaving_behavior',
        salience_critical: true,
        instrument: { salience_critical: true },
      }],
    });
    assert.ok(strip?.salience_signals?.length >= 1);
  });
});
