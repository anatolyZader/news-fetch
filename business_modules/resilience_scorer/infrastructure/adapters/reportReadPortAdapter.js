import {
  getCachedReport,
  getLatestGeneratedReport,
  resolveReportJsonPathForDate,
} from '../reportCacheService.js';

/** @returns {import('../../domain/ports/IReportReadPort.js').IReportReadPort} */
export function createReportReadPort() {
  return { getCachedReport, getLatestGeneratedReport, resolveReportJsonPathForDate };
}
