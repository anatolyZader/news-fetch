/**
 * Fetches articles from the API (same path as integration test) and writes them to a markdown file.
 * Usage: node scripts/fetch-articles-to-md.js [date YYYY-MM-DD]
 * Output: articles.md (or ARTICLES_MD env)
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });
import { createApp } from '../src/app.js';
import { createNewsApiArticlesFetcher } from '../src/newsApiAdapter.js';
import { getTodayInTimezone } from '../src/dateUtils.js';
import { writeFileSync } from 'node:fs';

const apiKey = (process.env.NEWSAPI_AI_KEY || process.env.NEWSAPI_API_KEY || process.env.NEWSAPI_KEY || '').trim();
const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
const outPath = process.env.ARTICLES_MD || 'articles.md';

if (!apiKey) {
  console.error('Missing NEWSAPI_API_KEY (e.g. in .env).');
  process.exit(1);
}

const date = process.argv[2] || getTodayInTimezone(timezone);
const fetchArticlesForDay = createNewsApiArticlesFetcher({ apiKey, timezone });
const app = await createApp({ apiKey, fetchArticlesForDay, timezone });

const res = await app.inject({ method: 'GET', url: `/articles?date=${date}` });

if (res.statusCode !== 200) {
  console.error('API error:', res.statusCode, res.body);
  process.exit(1);
}

const articles = JSON.parse(res.body);

const md = [
  `# Ynet.co.il articles (${date})`,
  '',
  `Total: ${articles.length} articles`,
  '',
  '| Title | URL | Published | Source |',
  '|-------|-----|-----------|--------|',
  ...articles.map((a) => `| ${escapeMdCell(a.title)} | ${escapeMdCell(a.url)} | ${escapeMdCell(a.publishedAt)} | ${escapeMdCell(a.source)} |`),
  '',
].join('\n');

function escapeMdCell(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

writeFileSync(outPath, md, 'utf8');
console.log(`Wrote ${articles.length} articles to ${outPath}`);
