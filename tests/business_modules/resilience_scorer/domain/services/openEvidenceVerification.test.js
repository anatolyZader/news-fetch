import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyOpenEvidenceClaims } from '../../../../../business_modules/resilience_scorer/domain/services/openEvidenceVerification.js';

describe('openEvidenceVerification', () => {
  it('verifies open claim with multi-hop specialist usage', () => {
    const assessment = {
      components: [{
        component_id: 'community_capital',
        specialist_ran: true,
      }],
      _agent_components: [{
        component_id: 'community_capital',
        specialist_ran: true,
        tool_usage: { multiHop: 1 },
        claims: [{
          claim_id: 'community_capital:c1',
          text: 'Volunteers organized aid',
          evidence_refs: ['open:obs-42', 'chunk:abc123'],
        }],
      }],
    };

    const verified = verifyOpenEvidenceClaims(assessment, [{
      observation_id: 'obs-42',
      evidence: 'Volunteers organized aid',
    }]);

    assert.equal(verified.length, 1);
    assert.equal(verified[0].observation_id, 'obs-42');
    assert.equal(verified[0].corroboration_level, 'multi_hop_and_rag');
  });

  it('skips open-only claims without corroboration', () => {
    const assessment = {
      components: [{ component_id: 'narrative', specialist_ran: true }],
      _agent_components: [{
        component_id: 'narrative',
        specialist_ran: true,
        tool_usage: {},
        claims: [{
          claim_id: 'narrative:c1',
          evidence_refs: ['open:obs-1'],
        }],
      }],
    };

    const verified = verifyOpenEvidenceClaims(assessment, [{
      observation_id: 'obs-1',
      evidence: 'Unverified only',
    }]);

    assert.equal(verified.length, 0);
  });
});
