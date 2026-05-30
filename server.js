/**
 * Start the Fastify server for the Ynet articles API.
 * Requires NEWSAPI_API_KEY in .env or env.
 */
import 'dotenv/config';
import { createApp } from './app.js';
import { createNewsApiArticlesFetcher } from './business_modules/news-sites/infrastructure/adapters/newsApiYnetAdapter.js';
import {
  validateProductionSecurity,
  productionSecurityWarnings,
} from './cross-cut-modules/security/app/validateProductionSecurity.js';
import { resolveListenHost } from './cross-cut-modules/security/app/resolveListenHost.js';

try {
  validateProductionSecurity();
} catch (err) {
  console.error(err?.message ?? err);
  process.exit(1);
}

for (const warning of productionSecurityWarnings()) {
  console.warn(`[security] ${warning}`);
}

const apiKey = (process.env.NEWSAPI_AI_KEY || process.env.NEWSAPI_API_KEY || process.env.NEWSAPI_KEY || '').trim();
const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';

if (!apiKey) {
  console.error('Missing API key. Set NEWSAPI_API_KEY in .env or env.');
  process.exit(1);
}

const fetchArticlesForDay = createNewsApiArticlesFetcher({ apiKey, timezone });
const app = await createApp({ apiKey, fetchArticlesForDay, timezone });

const host = resolveListenHost();
const port = Number(process.env.PORT || 3000);

await app.listen({ host, port });
console.log(`Ynet articles API listening on http://${host}:${port}`);
if (process.env.NODE_ENV === 'production' && host === '127.0.0.1') {
  console.log('Production bind: localhost only (127.0.0.1). Use reverse proxy on :443/:80.');
} else if (host === '0.0.0.0') {
  console.warn('[security] Listening on all interfaces (0.0.0.0). Not recommended for public production VMs.');
}
if (process.env.AUTH_REQUIRED === 'true') {
  const pid = (process.env.FIREBASE_PROJECT_ID ?? '').trim();
  console.log(
    `Identity Platform: JWT required on API routes (project: ${pid || 'MISSING — set FIREBASE_PROJECT_ID'})`,
  );
}
