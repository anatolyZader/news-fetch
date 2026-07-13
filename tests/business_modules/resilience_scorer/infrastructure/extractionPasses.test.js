import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  DOMAIN_GROUPS,
  isMultipassEnabled,
  getMultipassMode,
  getMultipassGroupKeys,
  domainsForPassKey,
  formatSignalCatalogSubset,
  buildDomainScopeSuffix,
  buildSelfCheckPrompt,
} from '../../../../business_modules/resilience_scorer/infrastructure/extractionPasses.js';
import { SIGNAL_CATALOG } from '../../../../business_modules/resilience_scorer/domain/contracts/index.js';

function intersectDomainGroups(a, b) {
  return a.filter((x) => b.includes(x));
}

describe('DOMAIN_GROUPS', () => {
  it('partitions all SIGNAL_CATALOG domains across the 3 groups', () => {
    const groupedDomains = new Set([...DOMAIN_GROUPS.A, ...DOMAIN_GROUPS.B, ...DOMAIN_GROUPS.C]);
    const allDomains = new Set(SIGNAL_CATALOG.map((s) => s.domain));
    for (const d of allDomains) {
      assert.ok(groupedDomains.has(d), `domain "${d}" is not assigned to any extraction pass`);
    }
  });

  it('has no overlap between groups', () => {
    assert.equal(intersectDomainGroups(DOMAIN_GROUPS.A, DOMAIN_GROUPS.B).length, 0);
    assert.equal(intersectDomainGroups(DOMAIN_GROUPS.A, DOMAIN_GROUPS.C).length, 0);
    assert.equal(intersectDomainGroups(DOMAIN_GROUPS.B, DOMAIN_GROUPS.C).length, 0);
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

describe('getMultipassMode / getMultipassGroupKeys', () => {
  it('mode 2 yields two passes AB and C', () => {
    assert.equal(getMultipassMode({ RESILIENCE_EXTRACT_MULTIPASS: '2' }), '2');
    assert.deepEqual(getMultipassGroupKeys({ RESILIENCE_EXTRACT_MULTIPASS: '2' }), ['AB', 'C']);
  });

  it('mode 2 AB merges A and B domains without overlap loss', () => {
    const ab = domainsForPassKey('AB');
    for (const d of DOMAIN_GROUPS.A) assert.ok(ab.includes(d));
    for (const d of DOMAIN_GROUPS.B) assert.ok(ab.includes(d));
    assert.doesNotMatch(buildDomainScopeSuffix('AB'), /SOCIAL FABRIC/i);
    assert.match(buildDomainScopeSuffix('C'), /SOCIAL FABRIC/i);
  });

  it('mode 1 yields three passes A/B/C', () => {
    assert.deepEqual(getMultipassGroupKeys({ RESILIENCE_EXTRACT_MULTIPASS: '1' }), ['A', 'B', 'C']);
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

describe('formatSignalCatalogSubset — v5 domains', () => {
  it('pass A includes environmental domain types', () => {
    const out = formatSignalCatalogSubset(DOMAIN_GROUPS.A);
    assert.match(out, /environmental_damage_acute/);
    assert.doesNotMatch(out, /diaspora_solidarity/);
  });

  it('pass B includes trust and cyber domain types', () => {
    const out = formatSignalCatalogSubset(DOMAIN_GROUPS.B);
    assert.match(out, /institutional_trust/);
    assert.match(out, /cyber_attack_on_infrastructure/);
    assert.doesNotMatch(out, /hostage_uncertainty_distress/);
  });

  it('pass C includes memory and hostage domain types', () => {
    const out = formatSignalCatalogSubset(DOMAIN_GROUPS.C);
    assert.match(out, /commemoration_event_observed/);
    assert.match(out, /hostage_return_event/);
    assert.doesNotMatch(out, /compliance_enter_shelter/);
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

  it('includes mirror hint in self-check prompt when type has mirror', () => {
    const out = buildSelfCheckPrompt([
      { signal_type: 'solidarity_help_others', evidence: 'residents brought food to elderly neighbors', evidence_type: 'observational_reported_fact' },
    ]);
    assert.match(out.user, /mirror=social_isolation/);
    assert.match(out.system, /mirror type/i);
  });
});
