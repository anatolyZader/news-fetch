/**
 * Start the Fastify server for the Ynet articles API.
 * Requires NEWSAPI_API_KEY in .env or env.
 */
import 'dotenv/config';
import { createApp } from './app.js';
import { createNewsApiArticlesFetcher } from './newsApiYnetAdapter.js';

const apiKey = (process.env.NEWSAPI_AI_KEY || process.env.NEWSAPI_API_KEY || process.env.NEWSAPI_KEY || '').trim();
const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';

if (!apiKey) {
  console.error('Missing API key. Set NEWSAPI_API_KEY in .env or env.');
  process.exit(1);
}

const fetchArticlesForDay = createNewsApiArticlesFetcher({ apiKey, timezone });
const app = await createApp({ apiKey, fetchArticlesForDay, timezone });

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);

await app.listen({ host, port });
console.log(`Ynet articles API listening on http://${host}:${port}`);
