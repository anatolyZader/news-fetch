import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  applyProbeCorroborationPolicy,
  enrichProbeSignalsInList,
  filterValidProbeRecords,
  validateProbeRecord,
} from '../../../../../business_modules/resilience/domain/services/probeCorroborationPolicy.js';

function probeSignal(source) {
  return {
    source_type: 'infrastructure_probe',
    signal_type: 'connectivity_outage',
    article_source: source,
    connectivity_outage: true,
  };
}

describe('probeCorroborationPolicy', () => {
  it('requires two distinct probe sources for confirmation without field', () => {
    const r = applyProbeCorroborationPolicy([probeSignal('a'), probeSignal('b')], []);
    assert.equal(r.probe_outage_confirmed, true);
    assert.equal(r.signals[0].extraction_confidence, 1);
  });

  it('confirms single probe when field anchor active', () => {
    const r = applyProbeCorroborationPolicy(
      [probeSignal('a')],
      [{ source_type: 'pbo', evidence: 'field ok' }],
    );
    assert.equal(r.probe_outage_confirmed, true);
  });

  it('marks single probe unconfirmed without field', () => {
    const r = applyProbeCorroborationPolicy([probeSignal('a')], []);
    assert.equal(r.probe_outage_unconfirmed, true);
    assert.equal(r.signals[0].extraction_confidence, 0.85);
  });

  it('filterValidProbeRecords enforces allowlist', () => {
    process.env.RESILIENCE_PROBE_SOURCE_ALLOWLIST = 'trusted-probe';
    const out = filterValidProbeRecords([
      { probe_source: 'trusted-probe', outage_detected: true, date: '2026-05-01' },
      { probe_source: 'evil', outage_detected: true, date: '2026-05-01' },
    ]);
    assert.equal(out.records.length, 1);
    assert.equal(out.rejected, 1);
    delete process.env.RESILIENCE_PROBE_SOURCE_ALLOWLIST;
  });

  it('validateProbeRecord verifies HMAC when secret set', () => {
    const payload = {
      date: '2026-05-01',
      probe_source: 'trusted',
      outage_detected: true,
    };
    process.env.RESILIENCE_PROBE_HMAC_SECRET = 'test-secret';
    const body = JSON.stringify(payload);
    const hmac = createHmac('sha256', 'test-secret').update(body).digest('hex');
    assert.equal(validateProbeRecord({ ...payload, hmac }).accepted, true);
    assert.equal(validateProbeRecord(payload).accepted, false);
    delete process.env.RESILIENCE_PROBE_HMAC_SECRET;
  });

  it('enrichProbeSignalsInList updates probe flags in mixed list', () => {
    const list = [
      probeSignal('only-one'),
      { source_type: 'news', evidence: 'x' },
    ];
    const out = enrichProbeSignalsInList(list);
    const p = out.find((s) => s.source_type === 'infrastructure_probe');
    assert.equal(p.probe_corroborated, false);
    assert.equal(p.extraction_confidence, 0.85);
  });
});
