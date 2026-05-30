export function createReportBotManualReportsService({ repository }) {
  if (!repository) throw new Error('repository is required');

  return {
    getDashboard() {
      const files = repository.listReports();
      return {
        inboxRelative: 'business_modules/report_bot/data',
        files,
      };
    },

    getFileText(fileName) {
      return repository.readReportText(fileName);
    },
  };
}
