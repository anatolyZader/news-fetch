import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @param {{ repository: ReturnType<import('../infrastructure/adapters/newsSitesFsAdapter.js').createNewsSitesFsAdapter>, rootDir: string }} opts
 */
export function createNewsSitesService(opts) {
  const { repository, rootDir } = opts;
  if (!repository) throw new Error('repository is required');

  function readPipelineEnabled() {
    try {
      const raw = readFileSync(resolve(rootDir, 'pipeline-config.json'), 'utf8');
      const cfg = JSON.parse(raw);
      return cfg?.sources?.news?.enabled !== false;
    } catch {
      return true;
    }
  }

  return {
    getDashboard() {
      const dates = repository.listAvailableDates();
      const totalArticles = dates.reduce((sum, d) => sum + (d.articleCount ?? 0), 0);
      return {
        enabled: readPipelineEnabled(),
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
