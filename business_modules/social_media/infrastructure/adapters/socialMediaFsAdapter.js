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

function parseDateFromBundleFile(file) {
  const m = String(file).match(/^signals-social-(\d{4}-\d{2}-\d{2})\.json$/);
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
      const path = resolve(dir, `topic-${slug}-${ts}.json`);
      writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      return { path };
    },
  };
}
