import { redactReportPayload } from '../../domain/services/operator/assessmentDisplayTier.js';

/** @returns {{ redactReportPayload: typeof redactReportPayload }} */
export function createReportDisplayPort() {
  return { redactReportPayload };
}
