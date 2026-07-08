import {
  getCachedReport,
  resolveReportJsonPathForDate,
} from '../reportCacheService.js';

/** @returns {import('../../domain/ports/IReportReadPort.js').IReportReadPort} */
export function createReportReadPort() {
  return { getCachedReport, resolveReportJsonPathForDate };
}
