/**
 * Port: persist municipal PBO review state and replies.
 */
export class IPboReviewStorePort {
  constructor() {
    if (new.target === IPboReviewStorePort) {
      throw new Error('IPboReviewStorePort is abstract');
    }
  }

  /** @returns {Promise<object|null>} */
  getReview(_date, _municipality) {
    throw new Error('not implemented');
  }

  /** @returns {Promise<object>} */
  upsertReview(_review) {
    throw new Error('not implemented');
  }

  /** @returns {Promise<Array<object>>} */
  listReviewsForDate(_date) {
    throw new Error('not implemented');
  }

  /** @returns {Promise<object|null>} */
  getReviewByToken(_token) {
    throw new Error('not implemented');
  }

  /** @returns {Promise<object>} */
  addReply(_reply) {
    throw new Error('not implemented');
  }

  /** @returns {Promise<Array<object>>} */
  listReplies(_date, _municipality) {
    throw new Error('not implemented');
  }
}
