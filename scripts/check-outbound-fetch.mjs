#!/usr/bin/env node
/**
 * Static scan: flag raw fetch() in user-URL code paths without safeFetch or trusted-vendor marker.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['business_modules', 'cross-cut-modules'];

const USER_URL_SIGNALS = [
  'ssrfGuard',
  'validateUserFetchUrl',
  'extractUrls',
  'validateRemoteVideoUrl',
  'safeFetch',
];

const TRUSTED_VENDOR_MARKER = 'security:trusted-vendor-fetch';

/** @type {Set<string>} */
const TRUSTED_VENDOR_FILES = new Set([
  'business_modules/news-sites/infrastructure/adapters/newsApiAdapterFactory.js',
  'business_modules/search_trends/infrastructure/adapters/dataforseoTrendsAdapter.js',
  'business_modules/whatsapp/infrastructure/adapters/metaCloudApiAdapter.js',
  'business_modules/resilience_scorer/infrastructure/embeddingEvidenceVerifier.js',
  'cross-cut-modules/vector_index/openaiEmbeddingAdapter.js',
  'cross-cut-modules/security/infrastructure/safeFetch.js',
]);

/** @type {string[]} */
const sourceFiles = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'tests') continue;
      walk(path);
    } else if (/\.(js|mjs|cjs)$/.test(name)) {
      sourceFiles.push(path);
    }
  }
}

for (const dir of SCAN_DIRS) {
  walk(join(ROOT, dir));
}

/** @type {string[]} */
const violations = [];

for (const absPath of sourceFiles) {
  const rel = relative(ROOT, absPath).replaceAll('\\', '/');
  const content = readFileSync(absPath, 'utf8');

  if (!content.includes('fetch(')) continue;
  if (content.includes(TRUSTED_VENDOR_MARKER) || TRUSTED_VENDOR_FILES.has(rel)) continue;
  if (content.includes('safeFetch(')) continue;

  const handlesUserUrls = USER_URL_SIGNALS.some((sig) => content.includes(sig));
  const isInputScript = rel.includes('/input/') && (rel.includes('discover') || rel.includes('debug-api'));
  const isCliGeo = rel === 'business_modules/geo/app/buildNorthReferenceCli.js';

  if (handlesUserUrls || isInputScript) {
    violations.push(`${rel}: uses fetch() in user-URL or untrusted URL path — use safeFetch or add ${TRUSTED_VENDOR_MARKER}`);
    continue;
  }

  if (isCliGeo) {
    violations.push(`${rel}: CLI fetch to user-supplied URL — use safeFetch or add ${TRUSTED_VENDOR_MARKER}`);
  }
}

if (violations.length === 0) {
  console.log('Outbound fetch audit OK.');
  process.exit(0);
}

console.error('Outbound fetch audit FAILED:');
for (const v of violations) {
  console.error(`  ${v}`);
}
process.exit(1);
