import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeOpenObservations } from '../../../../business_modules/open_observation_extraction/domain/services/openObservationRouter.js';

describe('openObservationRouter', () => {
  it('uses keyword routing when configured', async () => {
    const routed = await routeOpenObservations([
      {
        observation_id: 'o1',
        behavioral_description: 'Mayor coordinated municipal shelters',
        evidence: 'Mayor coordinated municipal shelters',
        confidence: 'medium',
      },
    ], { routingMode: 'keyword', env: { RESILIENCE_OPEN_OBS_ROUTING: 'keyword' } });

    assert.equal(routed.length, 1);
    assert.equal(routed[0].component_id, 'leadership');
    assert.equal(routed[0].routing_method, 'keyword');
  });
});
