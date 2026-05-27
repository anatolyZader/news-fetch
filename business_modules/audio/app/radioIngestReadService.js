import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @param {{ repository: ReturnType<import('../infrastructure/adapters/radioFsAdapter.js').createRadioFsAdapter>, rootDir: string }} opts
 */
export function createRadioIngestReadService(opts) {
  const { repository, rootDir } = opts;
  if (!repository) throw new Error('repository is required');

  function readPipelineEnabled() {
    try {
      const raw = readFileSync(resolve(rootDir, 'pipeline-config.json'), 'utf8');
      const cfg = JSON.parse(raw);
      return cfg?.sources?.radio?.enabled === true;
    } catch {
      return false;
    }
  }

  return {
    getDashboard() {
      const dates = repository.listAvailableDates();
      const totalSegments = dates.reduce((sum, d) => sum + (d.segmentCount ?? 0), 0);
      return {
        enabled: readPipelineEnabled(),
        summary: {
          totalDays: dates.length,
          totalSegments,
          totalFiles: dates.reduce((sum, d) => sum + (d.fileCount ?? 0), 0),
          dateRange: dates.length
            ? { from: dates.at(-1)?.date, to: dates[0]?.date }
            : null,
        },
        dates,
        storage: {
          filePattern: 'articles-audio-{station}-{date}T{HH-MM}.md',
          searchDirs: ['. (repo root)'],
          ingestCommand: 'npm run audio-to-md -- --input <file> --date YYYY-MM-DD --station … --program …',
        },
      };
    },

    getDailyFeed(date) {
      return repository.loadDailyFeed(date);
    },
  };
}
