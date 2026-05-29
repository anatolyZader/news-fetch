/**
 * Port: send municipal PBO follow-up emails.
 */
export class IPboReviewMailPort {
  constructor() {
    if (new.target === IPboReviewMailPort) {
      throw new Error('IPboReviewMailPort is abstract');
    }
  }

  /**
   * @param {object} args
   * @returns {Promise<{ id?: string }>}
   */
  sendMunicipalFollowUp(_args) {
    throw new Error('not implemented');
  }
}
