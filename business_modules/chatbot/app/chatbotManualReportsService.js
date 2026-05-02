export function createChatbotManualReportsService({ repository }) {
  if (!repository) throw new Error('repository is required');

  return {
    getDashboard() {
      const files = repository.listReports();
      return {
        inboxRelative: 'chatbot',
        files,
      };
    },

    getFileText(fileName) {
      return repository.readReportText(fileName);
    },
  };
}
