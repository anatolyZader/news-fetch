import {
  getCachedReport,
  resolveReportJsonPathForDate,
} from '../../app/operator/reportCacheService.js';

/** @returns {import('../../domain/ports/IReportReadPort.js').IReportReadPort} */
export function createReportReadPort() {
  return { getCachedReport, resolveReportJsonPathForDate };
}
