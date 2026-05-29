import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  recordOutletTelemetry,
  decayedOutletMultiplier,
  resetOutletReputationCacheForTests,
  DECAY_CLAMP_MIN,
  DECAY_CLAMP_MAX,
} from '../../../../../business_modules/resilience/domain/services/outletReputationDecay.js';
import { getOutletReliabilityMultiplier, resetOutletReliabilityPriorsCacheForTests } from '../../../../../business_modules/resilience/domain/services/outletReliabilityPriors.js';

let tmp;

beforeEach(() => {
  tmp = mkdtempSync(resolve(tmpdir(), 'outlet-decay-'));
  resetOutletReputationCacheForTests();
  resetOutletReliabilityPriorsCacheForTests();
  process.env.RESILIENCE_OUTLET_REPUTATION_PATH = resolve(tmp, 'rep.json');
  process.env.RESILIENCE_OUTLET_DECAY = '1';
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  resetOutletReputationCacheForTests();
  resetOutletReliabilityPriorsCacheForTests();
  delete process.env.RESILIENCE_OUTLET_REPUTATION_PATH;
  delete process.env.RESILIENCE_OUTLET_DECAY;
  delete process.env.RESILIENCE_OUTLET_PRIORS_PATH;
});

describe('outletReputationDecay', () => {
  it('decays multiplier with drop rate and dedup hits', () => {
    recordOutletTelemetry('ynet.co.il', { dropped: 4, verified: 6 });
    recordOutletTelemetry('ynet.co.il', { dedupHits: 2 });
    const m = decayedOutletMultiplier('ynet.co.il', 1.0);
    assert.ok(m < 1.0);
    assert.ok(m >= DECAY_CLAMP_MIN);
    assert.ok(m <= DECAY_CLAMP_MAX);
  });

  it('clamps to [0.1, 1.5]', () => {
    recordOutletTelemetry('bad.co.il', { dropped: 50, verified: 0 });
    assert.ok(decayedOutletMultiplier('bad.co.il', 0.5) >= DECAY_CLAMP_MIN);
    assert.equal(decayedOutletMultiplier('good.co.il', 2.0), DECAY_CLAMP_MAX);
  });

  it('integrates with getOutletReliabilityMultiplier when decay enabled', () => {
    const priorsPath = resolve(tmp, 'priors.json');
    process.env.RESILIENCE_OUTLET_PRIORS_PATH = priorsPath;
    writeFileSync(priorsPath, JSON.stringify({ 'ynet.co.il': { reliabilityMultiplier: 1.2 } }));

    recordOutletTelemetry('ynet.co.il', { dropped: 5, verified: 5 });
    const decayed = getOutletReliabilityMultiplier('ynet.co.il', priorsPath);
    assert.ok(decayed < 1.2);
  });
});
