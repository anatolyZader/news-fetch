import { deriveReviewStatus } from '../services/municipalCompleteness.js';

/**
 * Thin VO for PBO review lifecycle (status + email invariants).
 */
export class PboReview {
  /**
   * @param {{ date: string, municipality: string, status: string, gaps?: object[], supplementalTexts?: object, emailSent?: boolean }} fields
   */
  constructor(fields) {
    this.date = fields.date;
    this.municipality = fields.municipality;
    this.status = fields.status;
    this.gaps = fields.gaps ?? [];
    this.supplementalTexts = fields.supplementalTexts ?? {};
    this.emailSent = Boolean(fields.emailSent);
  }

  /**
   * @param {string} date
   * @param {string} municipality
   * @param {{ gaps: object[] }} completeness
   * @param {object} [supplementalTexts]
   */
  static fromCompleteness(date, municipality, completeness, supplementalTexts = {}) {
    const status = deriveReviewStatus(completeness.gaps ?? [], supplementalTexts);
    return new PboReview({
      date,
      municipality,
      status,
      gaps: completeness.gaps ?? [],
      supplementalTexts,
    });
  }

  canSendEmail() {
    return !this.emailSent && this.status !== 'complete';
  }

  withEmailSent() {
    return new PboReview({ ...this, emailSent: true });
  }
}
