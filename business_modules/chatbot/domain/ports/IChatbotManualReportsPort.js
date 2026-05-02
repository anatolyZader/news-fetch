/**
 * Port: list and read manual reports dropped in the server `chatbot/` directory.
 *
 * @typedef {{ fileName: string, size: number, mtimeMs: number, extension: string, snippet: string }} ChatbotManualReportFile
 */

export class IChatbotManualReportsPort {
  /** @returns {ChatbotManualReportFile[]} */
  listReports() {
    throw new Error('IChatbotManualReportsPort.listReports not implemented');
  }

  /** @param {string} fileName */
  /** @returns {string} */
  readReportText(fileName) {
    throw new Error('IChatbotManualReportsPort.readReportText not implemented');
  }
}
