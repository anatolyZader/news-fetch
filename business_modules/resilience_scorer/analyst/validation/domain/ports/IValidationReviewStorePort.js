/**
 * Port: validation review queue items and expert decisions.
 */
export class IValidationReviewStorePort {
  constructor() {
    if (new.target === IValidationReviewStorePort) {
      throw new Error('IValidationReviewStorePort is abstract');
    }
  }

  /** @returns {void} */
  upsertQueueItems(_date, _scope, _items, _meta) {
    throw new Error('not implemented');
  }

  /** @returns {Array<object>} */
  listItems(_date, _scope, _opts) {
    throw new Error('not implemented');
  }

  /** @returns {object|null} */
  getItem(_date, _scope, _articleKey) {
    throw new Error('not implemented');
  }

  /** @returns {object} */
  updateItemStatus(_date, _scope, _articleKey, _status) {
    throw new Error('not implemented');
  }

  /** @returns {object} */
  appendDecision(_decision) {
    throw new Error('not implemented');
  }

  /** @returns {object|null} */
  getLatestDecision(_date, _scope, _articleKey) {
    throw new Error('not implemented');
  }
}
