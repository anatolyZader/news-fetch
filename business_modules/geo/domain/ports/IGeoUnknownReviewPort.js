/**
 * Port for geo unknown locality review queue (read/update).
 */
export class IGeoUnknownReviewPort {
  /** @param {{ status?: string, limit?: number }} [_opts] */
  list(_opts) {
    throw new Error('not implemented');
  }

  /** @param {number} _id @param {{ status: string, reviewerNote?: string }} _update */
  updateStatus(_id, _update) {
    throw new Error('not implemented');
  }
}
