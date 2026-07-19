import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  CRITICAL_BYPASS_SIGNAL_TYPES,
  salienceContextFromDataVoid,
} from '../../../../../business_modules/resilience_scorer/domain/epistemic/highSalienceBypass.js';
import {
  deriveThinEvidencePolicy,
  THIN_EVIDENCE_INSTRUMENT,
} from '../../../../../business_modules/resilience_scorer/domain/epistemic/thinEvidencePolicy.js';
import { UNVERIFIED_CRITICAL_GROUNDING_REASON } from '../../../../../business_modules/resilience_scorer/domain/services/signals/groundingPolicy.js';

describe('critical-signal salience', () => {
  it('includes curated critical signal types', () => {
    assert.ok(CRITICAL_BYPASS_SIGNAL_TYPES.has('harm_to_population'));
    assert.ok(CRITICAL_BYPASS_SIGNAL_TYPES.has('early_warning_system_failure'));
    assert.ok(CRITICAL_BYPASS_SIGNAL_TYPES.has('panic_behavior'));
    assert.ok(!CRITICAL_BYPASS_SIGNAL_TYPES.has('community_mutual_aid'));
  });

  it('maps data void into salience context', () => {
    assert.deepEqual(salienceContextFromDataVoid(null), {});
    assert.deepEqual(
      salienceContextFromDataVoid({ level: 'critical', digital_darkness: true }),
      { dataVoidLevel: 'critical', digitalDarkness: true },
    );
    assert.deepEqual(
      salienceContextFromDataVoid({ level: 'none' }),
      { dataVoidLevel: 'none', digitalDarkness: false },
    );
  });
});

describe('thinEvidencePolicy — critical single signal', () => {
  it('shows assessment for salience_critical components', () => {
    const r = deriveThinEvidencePolicy({
      confidence: 'low',
      signal_count: 1,
      salience_critical: true,
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.critical_single_signal);
    assert.equal(r.operatorShowsScore, true);
  });

  it('escalates to unverified_alert for unverified critical grounding', () => {
    const r = deriveThinEvidencePolicy({
      confidence: 'low',
      signal_count: 1,
      salience_critical: true,
      salience_bypass_reasons: ['critical_signal', UNVERIFIED_CRITICAL_GROUNDING_REASON],
    });
    assert.equal(r.instrument, THIN_EVIDENCE_INSTRUMENT.unverified_alert);
    assert.equal(r.operatorShowsScore, false);
  });
});
