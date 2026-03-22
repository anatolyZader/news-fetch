import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getTodayInTimezone, validateDate } from './utils/dateUtils.js';
import { getCachedReport, runAnalysis } from './api/analysisService.js';
import { streamChat } from './api/chatService.js';
import { VideoGrabService } from './business_modules/video/app/videoGrabService.js';
import { createYtDlpYoutubeAdapter } from './business_modules/video/infrastructure/adapters/ytDlpYoutubeAdapter.js';
import { createLocalVideoFileAdapter } from './business_modules/video/infrastructure/adapters/localVideoFileAdapter.js';
import { initFirebaseAdminForAuth } from './auth/firebaseAdmin.js';
import { requireAuthPreHandler } from './auth/requireAuthPreHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @param {{ apiKey: string, fetchArticlesForDay: (opts: { date: string }) => Promise<Array>, timezone?: string, authRequired?: boolean }} options
 */
export async function createApp(options) {
  const apiKey = options?.apiKey?.trim?.() ?? '';
  if (!apiKey) {
    throw new Error('API key is required (set NEWSAPI_API_KEY in .env)');
  }

  const timezone = options.timezone || 'Asia/Jerusalem';
  const fetchArticlesForDay = options.fetchArticlesForDay;

  const authRequired =
    options.authRequired ??
    (process.env.AUTH_REQUIRED === 'true' && !!process.env.FIREBASE_PROJECT_ID?.trim());

  if (authRequired) {
    initFirebaseAdminForAuth(process.env.FIREBASE_PROJECT_ID.trim());
  }

  const authHook = authRequired ? { preHandler: requireAuthPreHandler } : {};

  const app = Fastify({ logger: false });

  const videoDownloadDir = process.env.VIDEO_DOWNLOAD_DIR?.trim()
    ? resolve(process.env.VIDEO_DOWNLOAD_DIR)
    : resolve(__dirname, '..', 'downloads', 'video');

  const videoGrabService = new VideoGrabService({
    remoteFetchPort: createYtDlpYoutubeAdapter(),
    localFilePort: createLocalVideoFileAdapter(),
  });

  // ─── Public: client discovers whether JWT is required (no auth) ────────────
  app.get('/api/auth/config', async (_req, reply) => {
    return reply.send({ authRequired });
  });

  // ─── Protected API routes (when AUTH_REQUIRED=true) ───────────────────────
  app.get('/api/report/today', authHook, async (_req, reply) => {
    const data = getCachedReport();
    return reply.send(data ? { found: true, ...data } : { found: false });
  });

  app.post('/api/analyze', authHook, async (_req, reply) => {
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

  app.post('/api/video/download-url', authHook, async (request, reply) => {
    const { url } = request.body ?? {};
    if (url == null || typeof url !== 'string' || !url.trim()) {
      return reply.code(400).send({ error: 'url is required' });
    }

    await mkdir(videoDownloadDir, { recursive: true });

    const result = await videoGrabService.downloadFromUrl(url, videoDownloadDir);
    if (!result.ok) {
      return reply.code(502).send({
        ok: false,
        error: result.error,
        stderr: typeof result.stderr === 'string' ? result.stderr.slice(0, 4000) : undefined,
      });
    }

    return reply.send({ success: true, outputPath: result.outputPath });
  });

  app.post('/api/video/local-file', authHook, async (request, reply) => {
    const { relativePath } = request.body ?? {};
    if (relativePath == null || typeof relativePath !== 'string' || !relativePath.trim()) {
      return reply.code(400).send({ error: 'relativePath is required' });
    }

    const result = await videoGrabService.resolveLocalVideo(relativePath.trim());
    if (!result.ok) {
      return reply.code(400).send(result);
    }

    return reply.send({ success: true, outputPath: result.outputPath });
  });

  app.post('/api/chat', authHook, async (request, reply) => {
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

  app.get('/articles', authHook, async (request, reply) => {
    const dateParam = request.query?.date;
    const date =
      dateParam != null && dateParam !== ''
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

  // ─── Static SPA (after API routes) ───────────────────────────────────────
  const clientDist = resolve(__dirname, '..', 'client', 'dist');
  await app.register(fastifyStatic, { root: clientDist, prefix: '/' });

  return app;
}
