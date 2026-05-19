/**
 * Port: list and read manual reports dropped in the server `report_bot/` directory.
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
