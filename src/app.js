import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getTodayInTimezone, validateDate } from './dateUtils.js';
import { getCachedReport, runAnalysis } from './api/analysisService.js';
import { streamChat } from './api/chatService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  // ─── Serve React client build ─────────────────────────────────────────────
  const clientDist = resolve(__dirname, '..', 'client', 'dist');
  await app.register(fastifyStatic, { root: clientDist, prefix: '/' });

  // ─── API: get today's cached report ───────────────────────────────────────
  app.get('/api/report/today', async (_req, reply) => {
    const data = getCachedReport();
    return reply.send(data ? { found: true, ...data } : { found: false });
  });

  // ─── API: run analysis (SSE stream) ───────────────────────────────────────
  app.post('/api/analyze', async (_req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const send = (data) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const { assessment, costUsd, date } = await runAnalysis({ onProgress: send });
      send({ type: 'done', assessment, costUsd, date });
    } catch (err) {
      send({ type: 'error', message: err.message });
    }
    reply.raw.end();
  });

  // ─── API: chat (SSE stream) ────────────────────────────────────────────────
  app.post('/api/chat', async (request, reply) => {
    const { message, history = [] } = request.body ?? {};
    if (!message) return reply.code(400).send({ error: 'message required' });

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    await streamChat(message, history, reply.raw);
    reply.raw.end();
  });

  // ─── Existing: articles API ────────────────────────────────────────────────
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
