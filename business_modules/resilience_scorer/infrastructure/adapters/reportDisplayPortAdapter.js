import { redactReportPayload } from '../../domain/services/assessmentDisplayTier.js';

/** @returns {{ redactReportPayload: typeof redactReportPayload }} */
export function createReportDisplayPort() {
  return { redactReportPayload };
}
