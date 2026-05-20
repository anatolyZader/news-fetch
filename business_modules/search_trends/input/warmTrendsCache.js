#!/usr/bin/env node
/**
 * Nightly Google Trends cache warm — one-shot CLI for cron (or systemd timer).
 *
 * Fetches and caches dashboards for every district × time window (1, 3, 7 days).
 * Set TRENDS_DEMO_MODE=1 to skip live fetches (writes demo payloads only).
 * Requires DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in the environment.
 *
 * Ops example (03:30 Asia/Jerusalem):
 *
 *   CRON_TZ=Asia/Jerusalem
 *   30 3 * * * cd /path/to/news && /usr/bin/env node business_modules/search_trends/input/warmTrendsCache.js >> /var/log/vibes-witch-trends.log 2>&1
 *
 * Optional: TRENDS_WARM_DELAY_MS=3000  (pause between district/window combos, default 2500)
 */
import 'dotenv/config';
import { createSearchTrendsService } from '../app/searchTrendsService.js';

async function main() {
  const delayMs = Number.parseInt(process.env.TRENDS_WARM_DELAY_MS ?? '2500', 10);
  const svc = createSearchTrendsService({});
  console.log('[trends-warm] Starting cache warm…');
  const summary = await svc.warmCache({
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 2500,
  });
  console.log(
    `[trends-warm] Done: ${summary.ok}/${summary.total} ok, ${summary.failed} failed at ${summary.warmedAt}`,
  );
  for (const r of summary.results.filter((x) => !x.ok)) {
    console.error(`[trends-warm] FAIL ${r.district} ${r.days}d: ${r.error}`);
  }
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[trends-warm] Fatal:', err?.message ?? err);
  process.exit(1);
});
