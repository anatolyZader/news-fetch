/**
 * One-off debug: call Event Registry getArticles and log response shape.
 * Run: node scripts/debug-api.js
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const apiKey = (process.env.NEWSAPI_AI_KEY || process.env.NEWSAPI_API_KEY || '').trim();
if (!apiKey) {
  console.error('No API key in .env');
  process.exit(1);
}

// No date: check if sourceUri array + dataType blog returns any ynet
const baseUrl = 'https://eventregistry.org/api/v1/article/getArticles';
const body = {
  action: 'getArticles',
  resultType: 'articles',
  apiKey,
  sourceUri: ['ynet.co.il', 'pplus.ynet.co.il'],
  lang: 'heb',
  dataType: ['news', 'blog'],
  articlesPage: 1,
  articlesCount: 20,
  articlesSortBy: 'date',
  articlesSortByAsc: false,
};
const res = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const data = await res.json();
console.log('Status:', res.status, 'totalResults:', data.articles?.totalResults);
const results = data.articles?.results ?? [];
results.slice(0, 3).forEach((r, i) => console.log(i + 1, r.date, r.source?.uri, r.title?.slice(0, 45)));
