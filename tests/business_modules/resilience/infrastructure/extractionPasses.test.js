import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  DOMAIN_GROUPS,
  isMultipassEnabled,
  formatSignalCatalogSubset,
  buildDomainScopeSuffix,
  buildSelfCheckPrompt,
} from '../../../../business_modules/resilience/infrastructure/extractionPasses.js';
import { SIGNAL_CATALOG } from '../../../../business_modules/resilience/domain/services/behaviorSignals.js';

describe('DOMAIN_GROUPS', () => {
  it('partitions all SIGNAL_CATALOG domains across the 3 groups', () => {
    const groupedDomains = new Set([...DOMAIN_GROUPS.A, ...DOMAIN_GROUPS.B, ...DOMAIN_GROUPS.C]);
    const allDomains = new Set(SIGNAL_CATALOG.map((s) => s.domain));
    for (const d of allDomains) {
      assert.ok(groupedDomains.has(d), `domain "${d}" is not assigned to any extraction pass`);
    }
  });

  it('has no overlap between groups', () => {
    const inter = (a, b) => a.filter((x) => b.includes(x));
    assert.equal(inter(DOMAIN_GROUPS.A, DOMAIN_GROUPS.B).length, 0);
    assert.equal(inter(DOMAIN_GROUPS.A, DOMAIN_GROUPS.C).length, 0);
    assert.equal(inter(DOMAIN_GROUPS.B, DOMAIN_GROUPS.C).length, 0);
  });
});

describe('isMultipassEnabled', () => {
  it('defaults to true when env is not set', () => {
    assert.equal(isMultipassEnabled({}), true);
  });

  it('returns false for "0" / "false" / "off"', () => {
    assert.equal(isMultipassEnabled({ RESILIENCE_EXTRACT_MULTIPASS: '0' }), false);
    assert.equal(isMultipassEnabled({ RESILIENCE_EXTRACT_MULTIPASS: 'false' }), false);
    assert.equal(isMultipassEnabled({ RESILIENCE_EXTRACT_MULTIPASS: 'off' }), false);
  });

  it('returns true for "1" / "true" / arbitrary', () => {
    assert.equal(isMultipassEnabled({ RESILIENCE_EXTRACT_MULTIPASS: '1' }), true);
    assert.equal(isMultipassEnabled({ RESILIENCE_EXTRACT_MULTIPASS: 'true' }), true);
  });
});

describe('formatSignalCatalogSubset', () => {
  it('only includes signal types from the requested domains', () => {
    const out = formatSignalCatalogSubset(['compliance']);
    assert.match(out, /compliance_enter_shelter/);
    assert.doesNotMatch(out, /information_clarity/);
    assert.doesNotMatch(out, /resilience_narrative_positive/);
  });

  it('returns multi-domain output for combined groups', () => {
    const out = formatSignalCatalogSubset(DOMAIN_GROUPS.B);
    assert.match(out, /information_clarity/);
    assert.match(out, /service_continuity/);
    assert.match(out, /leadership_visible_presence/);
    assert.doesNotMatch(out, /panic_behavior/);
  });
});

describe('buildDomainScopeSuffix', () => {
  it('emits the scoped header and embeds the catalog subset', () => {
    const s = buildDomainScopeSuffix('A');
    assert.match(s, /THIS PASS/);
    assert.match(s, /compliance_enter_shelter/);
    assert.doesNotMatch(s, /information_clarity/);
  });

  it('throws on unknown group keys', () => {
    assert.throws(() => buildDomainScopeSuffix('Z'));
  });
});

describe('buildSelfCheckPrompt', () => {
  it('produces system + user + indices for the supplied signals', () => {
    const sigs = [
      { signal_type: 'compliance_enter_shelter', evidence: 'residents went to shelter', evidence_type: 'observational_reported_fact' },
      { signal_type: 'leadership_clear_guidance', evidence: 'mayor announced shelter hours', evidence_type: 'named_institutional_fact' },
    ];
    const out = buildSelfCheckPrompt(sigs);
    assert.match(out.system, /closed-vocabulary signal classifier/i);
    assert.match(out.user, /Verify these 2 signals/);
    assert.match(out.user, /compliance_enter_shelter/);
    assert.match(out.user, /leadership_clear_guidance/);
    assert.deepEqual(out.indices, [0, 1]);
  });

  it('marks invalid signal types in the prompt', () => {
    const out = buildSelfCheckPrompt([
      { signal_type: 'definitely_not_a_real_type', evidence: 'x', evidence_type: 'observational_reported_fact' },
    ]);
    assert.match(out.user, /INVALID\(/);
  });
});
