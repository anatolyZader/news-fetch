/**
 * Fetches articles for one news site and writes `articles-<site>.md`.
 *
 * @module business_modules/news-sites/app/fetchArticlesToMd
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

import { getTodayInTimezone } from '../../../utils/dateUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');
config({ path: join(repoRoot, '.env') });

const SITE_ADAPTERS = {
  ynet: () => import('../infrastructure/adapters/newsApiYnetAdapter.js'),
  haaretz: () => import('../infrastructure/adapters/newsApiHaaretzAdapter.js'),
  maariv: () => import('../infrastructure/adapters/newsApiMaarivAdapter.js'),
  walla: () => import('../infrastructure/adapters/newsApiWallaAdapter.js'),
  mako: () => import('../infrastructure/adapters/newsApiMakoAdapter.js'),
  n12: () => import('../infrastructure/adapters/newsApiN12Adapter.js'),
  kan: () => import('../infrastructure/adapters/newsApiKanAdapter.js'),
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

function escapeMdHeading(s) {
  return String(s).replaceAll('#', '\\#').replaceAll('\n', ' ');
}

/**
 * @param {{ argv?: string[] }} [opts]
 */
export async function runFetchArticlesToMd(opts = {}) {
  const argv = opts.argv ?? process.argv;
  const apiKey = (process.env.NEWSAPI_AI_KEY || process.env.NEWSAPI_API_KEY || process.env.NEWSAPI_KEY || '').trim();
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';

  if (!apiKey) {
    console.error('Missing NEWSAPI_API_KEY (e.g. in .env).');
    process.exit(1);
  }

  const siteArg = (argv[2] || 'ynet').toLowerCase();
  const site = SITE_ADAPTERS[siteArg] ? siteArg : 'ynet';
  const dateArg = argv[3];
  const date = dateArg || getTodayInTimezone(timezone);

  const outPath = process.env.ARTICLES_MD || `articles-${site}.md`;

  const adapterModule = await SITE_ADAPTERS[site]();
  const createNewsApiArticlesFetcher = adapterModule.createNewsApiArticlesFetcher;
  const fetchArticlesForDay = createNewsApiArticlesFetcher({ apiKey, timezone });

  const rawArticles = await fetchArticlesForDay({ date });
  const _seen = new Set();
  const articles = rawArticles.filter((a) => {
    const key = a.title.replaceAll(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
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
    sections.push(`## ${i + 1}. ${escapeMdHeading(a.title)}`, '', `- **URL:** ${a.url}`, `- **Published:** ${a.publishedAt}`, `- **Source:** ${a.source}`, '');
    sections.push(a.body && a.body.trim() ? a.body.trim() : '_No full text available._', '', '---', '');
  }

  writeFileSync(outPath, sections.join('\n'), 'utf8');
  console.log(`Wrote ${articles.length} articles to ${outPath}`);
}
