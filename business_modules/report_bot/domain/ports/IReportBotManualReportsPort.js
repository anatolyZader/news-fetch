/**
 * Port: list and read manual reports dropped in `business_modules/report_bot/data/`.
 *
 * @typedef {{ fileName: string, size: number, mtimeMs: number, extension: string, snippet: string }} ReportBotManualReportFile
 */

export class IReportBotManualReportsPort {
  /** @returns {ReportBotManualReportFile[]} */
  listReports() {
    throw new Error('IReportBotManualReportsPort.listReports not implemented');
  }

  /** @param {string} fileName */
  /** @returns {string} */
  readReportText(_fileName) {
    throw new Error('IReportBotManualReportsPort.readReportText not implemented');
  }
}
