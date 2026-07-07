/**
 * @typedef {object} IReportReadPort
 * @property {(store: unknown, opts?: { scope?: string }) => object | null} getCachedReport
 * @property {(date: string, opts?: { scope?: string, reportsDir?: string }) => string | null} resolveReportJsonPathForDate
 */

export const IReportReadPort = {};
