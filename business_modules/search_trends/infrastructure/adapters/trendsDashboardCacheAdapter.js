import { mkdir, readFile } from 'node:fs/promises';
import { writeFileAtomic } from '../../../../cross-cut-modules/persistence/infrastructure/writeFileAtomic.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = join(__dirname, '../../data/cache');

/**
 * @param {{ cacheDir?: string, ttlMs?: number }} [opts]
 */
export function createTrendsDashboardCacheAdapter(opts = {}) {
  const cacheDir = opts.cacheDir ?? DEFAULT_CACHE_DIR;
  const ttlMs = opts.ttlMs ?? 6 * 60 * 60 * 1000;

  function cachePath(districtId, days) {
    return join(cacheDir, `dashboard-${districtId}-${days}d.json`);
  }

  return {
    async read(districtId, days, opts = {}) {
      try {
        const raw = await readFile(cachePath(districtId, days), 'utf8');
        const row = JSON.parse(raw);
        if (!row?.payload || !row?.cachedAt) return null;
        if (
          !opts.ignoreTtl &&
          Date.now() - new Date(row.cachedAt).getTime() > ttlMs
        ) {
          return null;
        }
        return row.payload;
      } catch {
        return null;
      }
    },

    /** @param {string} districtId @param {number} days */
    async readStale(districtId, days) {
      return this.read(districtId, days, { ignoreTtl: true });
    },

    async write(districtId, days, payload) {
      const path = cachePath(districtId, days);
      await mkdir(dirname(path), { recursive: true });
      await writeFileAtomic(
        path,
        JSON.stringify({ cachedAt: new Date().toISOString(), payload }, null, 0),
      );
    },
  };
}
