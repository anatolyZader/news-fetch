import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  getOutletReliabilityMultiplier,
  resetOutletReliabilityPriorsCacheForTests,
} from '../../../../../business_modules/resilience_scorer/domain/services/outletReliabilityPriors.js';
import { scoreComponents } from '../../../../../analyst/scoring/index.js';

let tmp;
let configPath;

beforeEach(() => {
  tmp = mkdtempSync(resolve(tmpdir(), 'outlet-priors-'));
  configPath = resolve(tmp, 'priors.json');
  resetOutletReliabilityPriorsCacheForTests();
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  resetOutletReliabilityPriorsCacheForTests();
  delete process.env.RESILIENCE_OUTLET_PRIORS_PATH;
});

describe('getOutletReliabilityMultiplier', () => {
  it('returns 1.0 when the priors file is missing', () => {
    assert.equal(getOutletReliabilityMultiplier('ynet.co.il', configPath), 1);
  });

  it('returns 1.0 for unknown article_source', () => {
    writeFileSync(configPath, JSON.stringify({ 'ynet.co.il': { reliabilityMultiplier: 0.9 } }));
    assert.equal(getOutletReliabilityMultiplier('unknown.co.il', configPath), 1);
  });

  it('reads the multiplier when present', () => {
    writeFileSync(configPath, JSON.stringify({ 'ynet.co.il': { reliabilityMultiplier: 0.9 } }));
    assert.equal(getOutletReliabilityMultiplier('ynet.co.il', configPath), 0.9);
  });

  it('clamps to [0.5, 1.5]', () => {
    writeFileSync(configPath, JSON.stringify({
      'too-low.co.il':  { reliabilityMultiplier: 0.1 },
      'too-high.co.il': { reliabilityMultiplier: 5 },
    }));
    assert.equal(getOutletReliabilityMultiplier('too-low.co.il', configPath), 0.5);
    assert.equal(getOutletReliabilityMultiplier('too-high.co.il', configPath), 1.5);
  });

  it('C3: invalidates the cache when the priors file mtime advances', () => {
    writeFileSync(configPath, JSON.stringify({ 'a.co.il': { reliabilityMultiplier: 0.7 } }));
    assert.equal(getOutletReliabilityMultiplier('a.co.il', configPath), 0.7);

    // Rewrite the file with a different multiplier and bump the mtime forward by 1s
    // (utimesSync sidesteps fs filesystem time resolution issues on some hosts).
    writeFileSync(configPath, JSON.stringify({ 'a.co.il': { reliabilityMultiplier: 1.3 } }));
    const future = new Date(Date.now() + 1000);
    utimesSync(configPath, future, future);

    assert.equal(getOutletReliabilityMultiplier('a.co.il', configPath), 1.3,
      'cache should reload when mtime advances');
  });
});

function outletPriorObsSignal(idx, source = 'ynet.co.il') {
  return {
    article_index: idx,
    article_url: `https://${source}/o${idx}`,
    article_source: source,
    source_type: 'news',
    signal_type: 'compliance_enter_shelter',
    evidence_type: 'observational_reported_fact',
    scope_level: 'single_case',
    evidence: `obs evidence ${idx} ${source}`,
    extraction_confidence: 0.9,
    temporal_weight: 1,
  };
}

function outletPriorQuoteSignal(idx, source = 'biased.co.il') {
  return {
    article_index: idx,
    article_url: `https://${source}/q${idx}`,
    article_source: source,
    source_type: 'news',
    signal_type: 'leadership_clear_guidance',
    evidence_type: 'direct_quote_named_person',
    scope_level: 'single_case',
    evidence: `Mayor Cohen said: "Today we open schools." (case ${idx} ${source})`,
    extraction_confidence: 0.9,
    temporal_weight: 1,
  };
}

describe('outlet priors propagate through scoreComponents only for reported/institutional facts', () => {
  it('observational_reported_fact: prior=0.5 reduces evidence_mass vs prior=1.0', () => {
    const signals = [outletPriorObsSignal(1), outletPriorObsSignal(2), outletPriorObsSignal(3)];

    writeFileSync(configPath, JSON.stringify({}));
    process.env.RESILIENCE_OUTLET_PRIORS_PATH = configPath;
    resetOutletReliabilityPriorsCacheForTests();
    const baseline = scoreComponents(signals, { totalArticles: 3 });
    const baseMass = baseline.lifesaving_behavior.evidence_mass;

    writeFileSync(configPath, JSON.stringify({ 'ynet.co.il': { reliabilityMultiplier: 0.5 } }));
    resetOutletReliabilityPriorsCacheForTests();
    const reduced = scoreComponents(signals, { totalArticles: 3 });
    const reducedMass = reduced.lifesaving_behavior.evidence_mass;

    assert.ok(baseMass > 0, 'baseline mass should be positive');
    assert.ok(
      reducedMass < baseMass - 1e-9,
      `expected reduced mass < baseline (${reducedMass} < ${baseMass})`,
    );
  });

  it('direct_quote_named_person: prior on the outlet does NOT change evidence_mass', () => {
    const signals = [outletPriorQuoteSignal(1), outletPriorQuoteSignal(2)];

    writeFileSync(configPath, JSON.stringify({}));
    process.env.RESILIENCE_OUTLET_PRIORS_PATH = configPath;
    resetOutletReliabilityPriorsCacheForTests();
    const baseline = scoreComponents(signals, { totalArticles: 2 });
    const baseMass = baseline.leadership.evidence_mass;

    writeFileSync(configPath, JSON.stringify({ 'biased.co.il': { reliabilityMultiplier: 0.5 } }));
    resetOutletReliabilityPriorsCacheForTests();
    const withPrior = scoreComponents(signals, { totalArticles: 2 });
    const priorMass = withPrior.leadership.evidence_mass;

    assert.equal(priorMass, baseMass);
  });
});
