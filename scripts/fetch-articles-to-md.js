/**
 * Fetches articles for a news site and writes them to a markdown file.
 * Usage: node scripts/fetch-articles-to-md.js [site] [date]
 *   site: ynet | haaretz | maariv | walla | mako | n12 | kan (default: ynet)
 *   date: YYYY-MM-DD (default: today)
 * Output: articles-<site>.md (or ARTICLES_MD env to override)
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

import { getTodayInTimezone } from '../src/dateUtils.js';

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

const apiKey = (process.env.NEWSAPI_AI_KEY || process.env.NEWSAPI_API_KEY || process.env.NEWSAPI_KEY || '').trim();
const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';

if (!apiKey) {
  console.error('Missing NEWSAPI_API_KEY (e.g. in .env).');
  process.exit(1);
}

const siteArg = (process.argv[2] || 'ynet').toLowerCase();
const site = SITE_ADAPTERS[siteArg] ? siteArg : 'ynet';
const dateArg = process.argv[3];
const date = dateArg || getTodayInTimezone(timezone);

const outPath = process.env.ARTICLES_MD || `articles-${site}.md`;

const adapterModule = await SITE_ADAPTERS[site]();
const createNewsApiArticlesFetcher = adapterModule.createNewsApiArticlesFetcher;
const fetchArticlesForDay = createNewsApiArticlesFetcher({ apiKey, timezone });

const rawArticles = await fetchArticlesForDay({ date });
const _seen = new Set();
const articles = rawArticles.filter((a) => {
  const key = a.title.replace(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
  if (_seen.has(key)) return false;
  _seen.add(key);
  return true;
});

const label = SITE_LABELS[site];
const sections = [
  `# ${label} articles (${date})`,
  '',
  `Total: ${articles.length} articles`,
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
console.log(`Wrote ${articles.length} articles to ${outPath}`);
