/**
 * Geo unknown locality review queue — read/update for analysts.
 */
import { geoUnknownReviewReadEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';

/**
 * @param {{ queueAdapter?: { list?: Function, updateStatus?: Function }|null }} deps
 */
export function createGeoUnknownReviewService(deps = {}) {
  const queue = deps.queueAdapter ?? null;

  return {
    enabled: geoUnknownReviewReadEnabled() && Boolean(queue?.list),

    list(opts = {}) {
      if (!geoUnknownReviewReadEnabled()) return [];
      if (!queue?.list) return [];
      return queue.list(opts);
    },

    updateStatus(id, update) {
      if (!geoUnknownReviewReadEnabled()) {
        throw new Error('Geo unknown review read API is disabled');
      }
      if (!queue?.updateStatus) {
        throw new Error('Geo unknown queue not configured (GEO_UNKNOWN_REVIEW_SQLITE=1)');
      }
      return queue.updateStatus(id, update);
    },
  };
}
