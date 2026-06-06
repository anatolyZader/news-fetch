/**
 * @param {{
 *   repository: ReturnType<import('../infrastructure/adapters/newsSitesFsAdapter.js').createNewsSitesFsAdapter>,
 *   pipelineConfigPort?: import('../domain/ports/INewsPipelineConfigPort.js').INewsPipelineConfigPort,
 * }} opts
 */
export function createNewsSitesService(opts) {
  const { repository, pipelineConfigPort } = opts;
  if (!repository) throw new Error('repository is required');

  return {
    getDashboard() {
      const dates = repository.listAvailableDates();
      const totalArticles = dates.reduce((sum, d) => sum + (d.articleCount ?? 0), 0);
      return {
        enabled: pipelineConfigPort?.isNewsPipelineEnabled?.() ?? true,
        summary: {
          totalDays: dates.length,
          totalArticles,
          dateRange: dates.length
            ? { from: dates.at(-1)?.date, to: dates[0]?.date }
            : null,
        },
        dates,
        storage: {
          articlesDir: 'business_modules/news-sites/articles_extracted',
          filePattern: 'articles-homefront-YYYY-MM-DD.md',
          ingestCommand: 'npm run homefront-to-md -- YYYY-MM-DD',
        },
      };
    },

    getDailyFeed(date) {
      return repository.loadDailyFeed(date);
    },
  };
}
