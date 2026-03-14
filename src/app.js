import Fastify from 'fastify';
import { getTodayInTimezone, validateDate } from './dateUtils.js';

/**
 * Fastify app factory for Ynet articles API.
 * @param {{ apiKey: string, fetchArticlesForDay: (opts: { date: string }) => Promise<Array>, timezone?: string }} options
 */
export async function createApp(options) {
  const apiKey = options?.apiKey?.trim?.() ?? '';
  if (!apiKey) {
    throw new Error('API key is required (set NEWSAPI_API_KEY in .env)');
  }

  const timezone = options?.timezone || 'Asia/Jerusalem';
  const fetchArticlesForDay = options.fetchArticlesForDay;

  const app = Fastify({ logger: false });

  app.get('/articles', async (request, reply) => {
    const dateParam = request.query?.date;
    const date = dateParam != null && dateParam !== ''
      ? String(dateParam).trim()
      : getTodayInTimezone(timezone);

    const validation = validateDate(date, timezone);
    if (!validation.valid) {
      return reply.code(400).send({ error: validation.error });
    }

    try {
      const articles = await fetchArticlesForDay({ date });
      return reply.code(200).send(Array.isArray(articles) ? articles : []);
    } catch {
      return reply.code(502).send({ error: 'Upstream unavailable' });
    }
  });

  return app;
}
