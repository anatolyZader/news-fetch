import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGeoUnknownReviewService } from '../../../../business_modules/geo/app/geoUnknownReviewService.js';

describe('geoUnknownReviewService', () => {
  it('lists via queue adapter', () => {
    const svc = createGeoUnknownReviewService({
      queueAdapter: {
        list: () => [{ id: 1, raw_name_last: 'Test', status: 'new', occurrence_count: 2 }],
        updateStatus: (id, u) => ({ ok: true, id, status: u.status }),
      },
    });
    assert.equal(svc.list().length, 1);
    assert.equal(svc.updateStatus(1, { status: 'resolved' }).ok, true);
  });

  it('returns empty when no adapter', () => {
    const svc = createGeoUnknownReviewService({});
    assert.deepEqual(svc.list(), []);
  });
});
