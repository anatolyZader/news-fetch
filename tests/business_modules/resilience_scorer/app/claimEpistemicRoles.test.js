import { describe, it } from 'node:test';
import { strict as assert } from 'assert';

import { claimsWithEpistemicRoles } from '../../../../business_modules/resilience_scorer/app/assessment/userNarrativePipeline.js';
import { buildSignalRefRegistry } from '../../../../business_modules/resilience_scorer/domain/services/narrative/signalRefRegistry.js';
import { buildDeterministicNarrativeFromClaims } from '../../../../business_modules/resilience_scorer/domain/services/user/userInvestigationSurface.js';
import { SIGNAL_PROVENANCE } from '../../../../business_modules/resilience_scorer/domain/services/signals/evidenceEligibility.js';

/**
 * Claims leave normalizeClaims carrying only text/signal_refs/relation, so the
 * deterministic fallback had nothing to section by and rendered one flat stack of
 * quotes (north 2026-04-03: 64 claims, every role null).
 */
function registryWithBoth() {
  return buildSignalRefRegistry({
    community_capital: {
      signals: [
        {
          signal_type: 'community_volunteering',
          article_url: 'https://local.example/1',
          evidence: 'Volunteers ran weekend home visits in the north',
        },
        {
          signal_type: 'post_event_recovery_indicator',
          article_url: 'https://national.example/2',
          evidence: 'Outgoing flight quota raised from 50 to 70 passengers',
          signalProvenance: SIGNAL_PROVENANCE.narrative_national_context,
        },
      ],
    },
  });
}

function refsOf(registry) {
  const keys = [...registry.byRef.keys()];
  return {
    local: keys.find((k) => k.startsWith('community_volunteering')),
    national: keys.find((k) => k.startsWith('post_event_recovery_indicator')),
  };
}

describe('claimsWithEpistemicRoles', () => {
  it('marks a claim resting only on out-of-scope refs as context_only', () => {
    const registry = registryWithBoth();
    const { national } = refsOf(registry);
    const [claim] = claimsWithEpistemicRoles(
      [{ text: 'Flight quota raised.', signal_refs: [national], relation: 'parallel' }],
      registry,
    );
    assert.equal(claim.user_epistemic_role, 'context_only');
  });

  it('leaves a locally grounded claim unset', () => {
    const registry = registryWithBoth();
    const { local } = refsOf(registry);
    const [claim] = claimsWithEpistemicRoles(
      [{ text: 'Volunteers ran home visits.', signal_refs: [local], relation: 'parallel' }],
      registry,
    );
    assert.equal(claim.user_epistemic_role, undefined);
  });

  it('keeps a mixed local/national claim as a local finding', () => {
    const registry = registryWithBoth();
    const { local, national } = refsOf(registry);
    const [claim] = claimsWithEpistemicRoles(
      [{ text: 'Mixed.', signal_refs: [local, national], relation: 'parallel' }],
      registry,
    );
    assert.equal(
      claim.user_epistemic_role,
      undefined,
      'matches isContextDerivedClaim every-ref semantics',
    );
  });

  it('never overwrites a role already present', () => {
    const registry = registryWithBoth();
    const { national } = refsOf(registry);
    const [claim] = claimsWithEpistemicRoles(
      [{ text: 'x', signal_refs: [national], user_epistemic_role: 'quarantined' }],
      registry,
    );
    assert.equal(claim.user_epistemic_role, 'quarantined');
  });

  it('is a no-op without a registry', () => {
    const claims = [{ text: 'x', signal_refs: ['whatever'] }];
    assert.deepEqual(claimsWithEpistemicRoles(claims, null), claims);
  });

  it('drives the fallback into a labelled context section, local findings first', () => {
    const registry = registryWithBoth();
    const { local, national } = refsOf(registry);
    const stamped = claimsWithEpistemicRoles([
      { text: 'Flight quota raised.', signal_refs: [national], relation: 'parallel' },
      { text: 'Volunteers ran home visits.', signal_refs: [local], relation: 'parallel' },
    ], registry);
    const prose = buildDeterministicNarrativeFromClaims(stamped);

    assert.ok(
      prose.includes('National or regional context (not local scored evidence)'),
      `expected a context section header, got: ${prose}`,
    );
    assert.ok(
      prose.indexOf('Volunteers ran home visits.') < prose.indexOf('Flight quota raised.'),
      'local findings must precede out-of-scope context',
    );
  });
});
