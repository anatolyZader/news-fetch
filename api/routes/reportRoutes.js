/**
 * Report, translation, video, and municipality API routes.
 */

import { mkdir } from 'node:fs/promises';
import { getTodayInTimezone, validateDate } from '../../utils/dateUtils.js';
import { getCachedReport } from '../analysisService.js';
import { getTranslatedReport } from '../../business_modules/translation/app/translationService.js';
import { getMunicipalityDashboard } from '../../business_modules/pbo_report_muni/app/pboMunicipalityService.js';
import {
  resolveDisplayView,
  redactReportPayload,
  redactScoreBySource,
  canViewAnalystDisplay,
  DISPLAY_VIEWS,
} from '../../business_modules/resilience/domain/services/assessmentDisplayTier.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export async function reportRoutes(app, opts) {
  const {
    authHook,
    evidenceStore,
    videoDownloadDir,
    videoGrabService,
    pboRegionalDailyService,
    timezone,
    fetchArticlesForDay,
  } = opts;

  app.get('/api/report/today', authHook, async (request, reply) => {
    const scope = request.query?.scope === 'north' ? 'north' : 'national';
    const requestedView = String(request.query?.view ?? 'operator').trim().toLowerCase();
    const data = getCachedReport(evidenceStore, { scope });
    if (!data) {
      if (scope === 'north') {
        return reply.send({
          found: false,
          code: 'north_requires_assess_signals',
          hint: 'north_requires_assess_signals',
          message:
            'No north-scoped report found. Run assess-signals with --scope north (news-only analysis does not produce a north artifact).',
        });
      }
      return reply.send({ found: false });
    }
    const display_view = resolveDisplayView({
      queryView: request.query?.view,
      userEmail: request.user?.email,
    });
    const analyst_denied = requestedView === DISPLAY_VIEWS.analyst
      && display_view !== DISPLAY_VIEWS.analyst;
    const redacted = redactReportPayload(data, display_view);
    return reply.send({
      found: true,
      display_view,
      ...(analyst_denied ? { analyst_denied: true, requested_view: DISPLAY_VIEWS.analyst } : {}),
      ...redacted,
    });
  });

  app.get('/api/resilience/display-capabilities', async (request, reply) => {
    await opts.tryAuthPreHandler(request, reply);
    return reply.send({
      canViewAnalyst: canViewAnalystDisplay(request.user?.email),
    });
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

  app.get('/api/municipalities', authHook, async (_request, reply) => {
    try {
      const data = getMunicipalityDashboard();
      return reply.send(data);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load municipality data' });
    }
  });

  app.get('/api/pbo/regional-report-days/:regionId', authHook, async (request, reply) => {
    const { regionId } = request.params ?? {};
    try {
      const data = pboRegionalDailyService.getRegionalPboReportDays(String(regionId ?? ''));
      return reply.send(data);
    } catch (err) {
      if (err?.code === 'UNKNOWN_REGION') {
        return reply.code(400).send({ error: err.message, code: 'UNKNOWN_REGION' });
      }
      return reply.code(502).send({ error: err?.message ?? 'Failed to load regional PBO reports' });
    }
  });

  app.post('/api/translate', authHook, async (request, reply) => {
    const { report, lang } = request.body ?? {};
    if (!report || !lang || lang === 'en') return reply.send({ report: report ?? null });
    if (process.env.TRANSLATION_ENABLED !== 'true') return reply.send({ report });
    try {
      if (!report.score_by_source) {
        const scope = report.report_scope?.id === 'north' ? 'north' : 'national';
        const cached = getCachedReport(evidenceStore, { scope });
        if (cached?.score_by_source) {
          const view = report.display_view === DISPLAY_VIEWS.analyst
            ? DISPLAY_VIEWS.analyst
            : DISPLAY_VIEWS.operator;
          report.score_by_source = redactScoreBySource(cached.score_by_source, view);
        }
      }
      return getTranslatedReport(report, lang).then((translated) => reply.send({ report: translated }));
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Translation failed' });
    }
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
}
