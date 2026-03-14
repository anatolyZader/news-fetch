/**
 * Fetches main-news articles from all sites, keeps only those relevant to population
 * behavior in emergency and Home Front Command (פיקוד העורף), and writes them to a
 * single markdown file for analysis.
 *
 * Usage: node scripts/extract-homefront-articles.js [date YYYY-MM-DD]
 * Output: articles-homefront.md (or HOMEFRONT_MD env)
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

import { getTodayInTimezone } from '../src/dateUtils.js';
import { isHomefrontRelevant } from './homefront-keywords.js';

const SITE_ADAPTERS = {
  ynet: () => import('../src/newsApiYnetAdapter.js'),
  haaretz: () => import('../src/newsApiHaaretzAdapter.js'),
  maariv: () => import('../src/newsApiMaarivAdapter.js'),
  walla: () => import('../src/newsApiWallaAdapter.js'),
  mako: () => import('../src/newsApiMakoAdapter.js'),
  n12: () => import('../src/newsApiN12Adapter.js'),
  kan: () => import('../src/newsApiKanAdapter.js'),
};

const SITE_LABELS = {
  ynet: 'Ynet.co.il',
  haaretz: 'Haaretz',
  maariv: 'Maariv',
  walla: 'Walla',
  mako: 'Mako',
  n12: 'N12 (Channel 12)',
  kan: 'KAN 11',
};

const SITE_KEYS = Object.keys(SITE_ADAPTERS);

const apiKey = (process.env.NEWSAPI_AI_KEY || process.env.NEWSAPI_API_KEY || process.env.NEWSAPI_KEY || '').trim();
const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
const outPath = process.env.HOMEFRONT_MD || 'articles-homefront.md';

if (!apiKey) {
  console.error('Missing NEWSAPI_API_KEY (e.g. in .env).');
  process.exit(1);
}

const date = process.argv[2] || getTodayInTimezone(timezone);

const allArticles = [];
for (const site of SITE_KEYS) {
  const adapterModule = await SITE_ADAPTERS[site]();
  const createNewsApiArticlesFetcher = adapterModule.createNewsApiArticlesFetcher;
  const fetchArticlesForDay = createNewsApiArticlesFetcher({ apiKey, timezone });
  try {
    const articles = await fetchArticlesForDay({ date });
    const label = SITE_LABELS[site];
    for (const a of articles) {
      allArticles.push({ ...a, source: a.source || label });
    }
  } catch (err) {
    console.error(`Failed to fetch ${site}:`, err.message);
  }
}

const articles = allArticles.filter((a) => isHomefrontRelevant(a.title, a.body));

const sections = [
  `# Home Front / population-in-emergency articles (${date})`,
  '',
  `For Home Front Command (פיקוד העורף) and population-behavior analysis.`,
  `Includes: psychoemotional state of the population; special/vulnerable populations.`,
  `Filtered from ${allArticles.length} main-news articles (all sites) → ${articles.length} relevant.`,
  '',
];

for (let i = 0; i < articles.length; i++) {
  const a = articles[i];
  sections.push(`## ${i + 1}. ${escapeMdHeading(a.title)}`);
  sections.push('');
  sections.push(`- **URL:** ${a.url}`);
  sections.push(`- **Published:** ${a.publishedAt}`);
  sections.push(`- **Source:** ${a.source}`);
  sections.push('');
  sections.push(a.body && a.body.trim() ? a.body.trim() : '_No full text available._');
  sections.push('');
  sections.push('---');
  sections.push('');
}

function escapeMdHeading(s) {
  return String(s).replace(/#/g, '\\#').replace(/\n/g, ' ');
}

writeFileSync(outPath, sections.join('\n'), 'utf8');
console.log(`Wrote ${articles.length} home-front–relevant articles to ${outPath} (from ${allArticles.length} total)`);
