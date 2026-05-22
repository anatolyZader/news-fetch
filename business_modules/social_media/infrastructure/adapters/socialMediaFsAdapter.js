import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSocialOsintMarkdown, reportFilename } from '../../domain/services/socialMediaReportWriter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const moduleRoot = resolve(__dirname, '../..');
const defaultDataDir = resolve(moduleRoot, 'data');

function bundleFilename(date) {
  return `signals-social-${date}.json`;
}

const BUNDLE_FILENAME_RE = /^signals-social-(\d{4}-\d{2}-\d{2})\.json$/;

function parseDateFromBundleFile(file) {
  const m = BUNDLE_FILENAME_RE.exec(String(file));
  return m?.[1] ?? null;
}

/**
 * @param {{ dataDir?: string }} [opts]
 */
export function createSocialMediaFsAdapter(opts = {}) {
  const dataDir = opts.dataDir ?? defaultDataDir;

  return {
    dataDir() {
      return dataDir;
    },

    bundlePath(date) {
      return resolve(dataDir, bundleFilename(date));
    },

    reportPath(date) {
      return resolve(dataDir, reportFilename(date));
    },

    listBundleFilenames() {
      if (!existsSync(dataDir)) return [];
      return readdirSync(dataDir).filter(
        (f) => f.startsWith('signals-social-') && f.endsWith('.json'),
      );
    },

    listAvailableDates() {
      return this.listBundleFilenames()
        .map(parseDateFromBundleFile)
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a));
    },

    hasReport(date) {
      return existsSync(resolve(dataDir, reportFilename(date)));
    },

    async loadBundle(date) {
      const path = resolve(dataDir, bundleFilename(date));
      if (!existsSync(path)) return null;
      const raw = readFileSync(path, 'utf8');
      return JSON.parse(raw);
    },

    async loadReportMarkdown(date) {
      const path = resolve(dataDir, reportFilename(date));
      if (!existsSync(path)) return null;
      return readFileSync(path, 'utf8');
    },

    async saveBundle(date, bundle) {
      mkdirSync(dataDir, { recursive: true });
      const path = resolve(dataDir, bundleFilename(date));
      writeFileSync(path, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
      return { path };
    },

    async saveReport(date, bundle) {
      mkdirSync(dataDir, { recursive: true });
      const path = resolve(dataDir, reportFilename(date));
      writeFileSync(path, buildSocialOsintMarkdown(bundle), 'utf8');
      return { path };
    },

    topicFetchesDir() {
      return resolve(dataDir, 'topic-fetches');
    },

    async saveTopicFetch(slug, payload) {
      const dir = resolve(dataDir, 'topic-fetches');
      mkdirSync(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const id = `topic-${slug}-${ts}`;
      const path = resolve(dir, `${id}.json`);
      writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      return { path, id };
    },

    listTopicFetches(limit = 50) {
      const dir = resolve(dataDir, 'topic-fetches');
      if (!existsSync(dir)) return [];
      const files = readdirSync(dir)
        .filter((f) => f.startsWith('topic-') && f.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a))
        .slice(0, Math.max(1, Math.min(limit, 100)));

      return files.map((file) => {
        const id = file.replace(/\.json$/i, '');
        try {
          const raw = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
          return {
            id,
            topic: raw.topic ?? '',
            fetchedAt: raw.fetchedAt ?? null,
            platforms: raw.platforms ?? [],
            postCount: raw.stats?.afterDedup ?? raw.posts?.length ?? 0,
            lang: raw.lang ?? 'en',
          };
        } catch {
          return { id, topic: '', fetchedAt: null, platforms: [], postCount: 0, lang: 'en' };
        }
      }).filter((row) => row.topic);
    },

    async loadTopicFetch(id) {
      const safeId = String(id ?? '').trim().replace(/\.json$/i, '');
      if (!safeId.startsWith('topic-') || safeId.includes('..') || /[/\\]/.test(safeId)) {
        return null;
      }
      const path = resolve(dataDir, 'topic-fetches', `${safeId}.json`);
      if (!existsSync(path)) return null;
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      return { ...raw, id: safeId };
    },
  };
}
