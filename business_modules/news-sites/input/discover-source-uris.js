#!/usr/bin/env node
/**
 * Discover Event Registry source URIs for N12 and KAN (and optionally other sites).
 * Run: node business_modules/news-sites/input/discover-source-uris.js [date YYYY-MM-DD]
 * security:trusted-vendor-fetch
 *
 * 1) Fetches Hebrew articles for the date without sourceUri filter and collects
 *    unique source.uri values that contain "n12" or "kan".
 * 2) Probes common URI variants with getArticles and reports totalResults per variant.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '..', '..', '.env') });

const apiKey = (process.env.NEWSAPI_AI_KEY || process.env.NEWSAPI_API_KEY || process.env.NEWSAPI_KEY || '').trim();
if (!apiKey) {
  console.error('Missing API key (NEWSAPI_AI_KEY or NEWSAPI_API_KEY in .env).');
  process.exit(1);
}

const BASE_URL = 'https://eventregistry.org/api/v1/article/getArticles';

// Use provided date or yesterday (more likely to have data)
const dateArg = process.argv[2];
const date = dateArg || yesterdayLocal();

function yesterdayLocal() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function getArticles(options) {
  const body = {
    action: 'getArticles',
    resultType: 'articles',
    apiKey,
    lang: 'heb',
    dateStart: date,
    dateEnd: date,
    dataType: ['news', 'blog'],
    articlesPage: 1,
    articlesCount: 100,
    articlesSortBy: 'date',
    articlesSortByAsc: false,
    ...options,
  };
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function probeUriVariants(label, variants) {
  console.log(`\n--- ${label} ---`);
  for (const uri of variants) {
    try {
      const data = await getArticles({ sourceUri: [uri] });
      const total = data?.articles?.totalResults ?? 0;
      const sample = (data?.articles?.results ?? [])[0];
      const sampleUri = sample?.source?.uri ?? '—';
      const sampleSuffix = sample ? `, sample source.uri: ${sampleUri}` : '';
      console.log(`  ${uri} => totalResults: ${total}${sampleSuffix}`);
    } catch (e) {
      console.log(`  ${uri} => error: ${e.message}`);
    }
  }
}

// 1) Fetch Hebrew articles without source filter and collect N12/KAN source URIs
console.log(`Date: ${date}`);
console.log('\n--- Hebrew sources containing "n12" or "kan" (from unfiltered getArticles) ---');
let data;
try {
  data = await getArticles({});
} catch (e) {
  console.error('Failed to fetch unfiltered articles:', e.message);
  data = { articles: { results: [] } };
}

const results = data?.articles?.results ?? [];
const byUri = new Map();
for (const r of results) {
  const uri = r.source?.uri;
  if (uri && (uri.includes('n12') || uri.includes('kan'))) {
    if (!byUri.has(uri)) byUri.set(uri, { title: r.source?.title, count: 0 });
    byUri.get(uri).count += 1;
  }
}
if (byUri.size === 0) {
  console.log('  (none found in first 100 results; will probe variants below)');
  const allUris = [...new Set(results.map((r) => r.source?.uri).filter(Boolean))];
  console.log('  Sample of all source.uri in response:', allUris.slice(0, 15).join(', '));
} else {
  for (const [uri, info] of byUri) {
    console.log(`  ${uri} (title: ${info.title || '—'}, count: ${info.count})`);
  }
}

// 2) Probe common URI variants for N12 and KAN
await probeUriVariants('N12 URI variants', [
  'n12.co.il',
  'www.n12.co.il',
  'm.n12.co.il',
  '12tv.co.il',
  'news.n12.co.il',
]);

await probeUriVariants('KAN URI variants', [
  'kan.org.il',
  'www.kan.org.il',
  'm.kan.org.il',
  'kan11.co.il',
]);

// 3) Try suggestSources endpoint if available
const SUGGEST_URL = 'https://eventregistry.org/api/v1/source/suggestSources';
console.log('\n--- suggestSources (prefix: n12, kan) ---');
for (const prefix of ['n12', 'kan', 'channel 12', 'kan 11']) {
  try {
    const res = await fetch(SUGGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'suggestSources', apiKey, prefix }),
    });
    const json = await res.json().catch(() => ({}));
    const items = json?.sources ?? json?.results ?? (Array.isArray(json) ? json : []);
    if (items.length > 0) {
      console.log(`  prefix "${prefix}":`, items.slice(0, 5).map((s) => s.uri || s.id || s.name || s).join(', '));
    } else {
      console.log(`  prefix "${prefix}":`, res.status, typeof json === 'object' ? JSON.stringify(json).slice(0, 120) : json);
    }
  } catch (e) {
    console.log(`  prefix "${prefix}":`, e.message);
  }
}

console.log('\nDone. Use the URI(s) that return totalResults > 0 in the adapters.\n');
