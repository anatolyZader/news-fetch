import { redactReportPayload } from '../../domain/services/user/assessmentDisplayTier.js';

/** @returns {{ redactReportPayload: typeof redactReportPayload }} */
export function createReportDisplayPort() {
  return { redactReportPayload };
}
