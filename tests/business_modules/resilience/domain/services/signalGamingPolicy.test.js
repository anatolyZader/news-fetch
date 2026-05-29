import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applySignalGamingPolicy,
  applyWhatsappSenderCaps,
  isDmPhoneAllowed,
  gamingContributionMultiplier,
} from '../../../../../business_modules/resilience/domain/services/signalGamingPolicy.js';

describe('signalGamingPolicy', () => {
  it('isDmPhoneAllowed passes when env unset', () => {
    delete process.env.WHATSAPP_ALLOWED_DM_PHONES;
    assert.equal(isDmPhoneAllowed('+972501234567'), true);
  });

  it('isDmPhoneAllowed enforces allowlist', () => {
    process.env.WHATSAPP_ALLOWED_DM_PHONES = '+972501234567';
    assert.equal(isDmPhoneAllowed('+972501234567'), true);
    assert.equal(isDmPhoneAllowed('+972509999999'), false);
    delete process.env.WHATSAPP_ALLOWED_DM_PHONES;
  });

  it('applyWhatsappSenderCaps marks excess signals', () => {
    process.env.RESILIENCE_WHATSAPP_MAX_SIGNALS_PER_SENDER = '2';
    const signals = [1, 2, 3].map((i) => ({
      source_type: 'field_whatsapp',
      signal_type: 'fear_expression',
      field_provenance: { officer_id: 'off1' },
      evidence: `e${i}`,
    }));
    const out = applyWhatsappSenderCaps(signals);
    assert.equal(out[2].gaming_suspect, true);
    assert.equal(gamingContributionMultiplier(out[2]), 0);
    delete process.env.RESILIENCE_WHATSAPP_MAX_SIGNALS_PER_SENDER;
  });

  it('applySignalGamingPolicy is noop when disabled', () => {
    process.env.RESILIENCE_GAMING_POLICY = '0';
    const s = [{ source_type: 'whatsapp', evidence: 'x' }];
    assert.deepEqual(applySignalGamingPolicy(s), s);
    delete process.env.RESILIENCE_GAMING_POLICY;
  });
});
