import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTodayInTimezone } from '../../../utils/dateUtils.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
const reportsDir = process.env.REPORTS_DIR?.trim()
  ? process.env.REPORTS_DIR.trim()
  : join(repoRoot, 'tests/e2e/fixtures/reports');

/**
 * Write a minimal national report for Jerusalem "today" so GET /api/report/today returns data.
 * @returns {{ date: string, path: string }}
 */
export function seedTodayReport() {
  const today = getTodayInTimezone(timezone);
  mkdirSync(reportsDir, { recursive: true });

  const filename = `resilience-report-data-${today}-run-e2e.json`;
  const path = join(reportsDir, filename);
  const payload = {
    assessment: {
      date: today,
      report_scope: { id: 'national' },
      total_articles_analyzed: 10,
      cross_component_synthesis: 'E2E fixture synthesis.',
      components: [{ component_id: 'narrative', narrative: 'E2E narrative component.' }],
    },
    score_by_source: { press: { score: 5 } },
    generated_at: new Date().toISOString(),
  };

  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8');
  return { date: today, path };
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const { date, path } = seedTodayReport();
  console.log(`[e2e] seeded report for ${date}: ${path}`);
}
