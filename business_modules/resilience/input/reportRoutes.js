/**
 * Report, translation, video, and municipality API routes.
 */

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getTodayInTimezone, validateDate } from '../../../utils/dateUtils.js';
import { getTranslatedReport } from '../../translation/index.js';
import { buildMunicipalityDashboardDto } from '../../pbo_report_muni/index.js';
import { requireOperatorDistrictAccess } from '../../../cross-cut-modules/auth/operatorDistrictAccess.js';
import { canViewAnalystDisplay } from '../../../cross-cut-modules/auth/userAccess.js';
import {
  getCachedReport as getCachedReportDefault,
  getAvailableReportDates,
  resolveDisplayView,
  redactReportPayload,
  redactScoreBySource,
  DISPLAY_VIEWS,
  normalizeReportScope,
  buildAttentionItems,
  buildActionCompass,
  buildAnomalyStrip,
  updateOperatorRecommendationStatus,
  parseOperatorRecommendationRequest,
} from '../index.js';
import { isRegionalReportScope } from '../../../cross-cut-modules/geo/reportScopeIds.js';
import { auditFromRequest } from '../../../cross-cut-modules/security/input/auditLog.js';
import {
  assertResolvedHostSafe,
  validateUserFetchUrl,
} from '../../../cross-cut-modules/security/domain/services/ssrfGuard.js';
import { costlyRoutePreHandlers } from '../../../cross-cut-modules/security/input/costlyRoutePreHandlers.js';
import { authPreHandlerList } from '../../../cross-cut-modules/auth/buildAuthHooks.js';

/**
 * @param {{ enabled?: boolean, list?: Function } | null | undefined} svc
 * @returns {number}
 */
function countPendingGeoUnknown(svc) {
  if (!svc?.enabled || typeof svc.list !== 'function') return 0;
  return svc.list({ status: 'new', limit: 100 }).length;
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export async function reportRoutes(app, opts) {
  const {
    authHook,
    readAuthHook,
    evidenceStore,
    reportReadPort,
    videoDownloadDir,
    videoGrabService,
    pboRegionalDailyService,
    timezone,
    fetchArticlesForDay,
    sqlitePath,
    crisisBudgetService = null,
    geoUnknownReviewService = null,
  } = opts;

  const getCachedReport = (store, readOpts) =>
    (reportReadPort?.getCachedReport ?? getCachedReportDefault)(store, readOpts);

  const todayAuthHook = readAuthHook ?? authHook;

  app.get('/api/report/agent-trace/:traceId', todayAuthHook, async (request, reply) => {
    if (!canViewAnalystDisplay(request.user?.email)) {
      return reply.code(403).send({ error: 'analyst_only' });
    }
    const { createTraceStore } = await import('../../../cross-cut-modules/agent/index.js');
    const traceStore = createTraceStore(resolve(process.cwd(), 'daily_reports'));
    const events = traceStore.readAll(String(request.params?.traceId ?? ''));
    if (!events.length) return reply.code(404).send({ error: 'trace_not_found' });
    return reply.send({ trace_id: request.params.traceId, events });
  });

  app.post('/api/report/claim-feedback', {
    ...authHook,
    schema: {
      body: {
        type: 'object',
        required: ['date', 'component_id', 'claim_text', 'action'],
        properties: {
          date: { type: 'string' },
          component_id: { type: 'string' },
          claim_text: { type: 'string' },
          action: { type: 'string', enum: ['reject', 'accept'] },
          rationale: { type: 'string' },
          scope: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    if (!canViewAnalystDisplay(request.user?.email)) {
      return reply.code(403).send({ error: 'analyst_only' });
    }
    const { date, component_id, claim_text, action, rationale, scope = 'national' } = request.body ?? {};
    if (action === 'reject' && claim_text) {
      try {
        const { createInstitutionalMemoryService } = await import('../../resilience_assessment/index.js');
        const { createRetrievalService } = await import('../../../cross-cut-modules/retrieval/createRetrievalService.js');
        const svc = createRetrievalService({ dbPath: sqlitePath ?? opts.sqlitePath });
        const memory = createInstitutionalMemoryService({
          chunkStore: svc.chunkStore,
          rebuildFts: () => svc.rebuildFts(),
          reportsDir: resolve(process.cwd(), 'daily_reports'),
        });
        await memory.indexAnalystCorrection({
          date,
          componentId: component_id,
          claimText: claim_text,
          rationale: rationale ?? '',
          analystEmail: request.user?.email,
        });
        svc.close();
      } catch (err) {
        return reply.code(500).send({ error: err?.message ?? 'index_failed' });
      }
    }
    auditFromRequest(request, 'report.claim_feedback', '/api/report/claim-feedback', {
      date, component_id, action, scope,
    });
    return reply.send({ ok: true });
  });

  app.get('/api/report/divergence', todayAuthHook, async (request, reply) => {
    if (!canViewAnalystDisplay(request.user?.email)) {
      return reply.code(403).send({ error: 'analyst_only' });
    }
    const scope = normalizeReportScope(request.query?.scope ?? 'national');
    const date = String(request.query?.date ?? '').trim()
      || getCachedReport(evidenceStore, { scope })?.reportDate;
    if (!date) return reply.code(404).send({ error: 'date_required' });
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const path = join(process.cwd(), 'daily_reports', `divergence-${scope}-${date}.json`);
    if (!existsSync(path)) return reply.code(404).send({ error: 'divergence_not_found' });
    return reply.send(JSON.parse(readFileSync(path, 'utf8')));
  });

  app.get('/api/report/dates', todayAuthHook, async (request, reply) => {
    const scope = normalizeReportScope(request.query?.scope ?? 'national');
    if (isRegionalReportScope(scope)) {
      if (!requireOperatorDistrictAccess(request, reply, scope)) return;
    }
    const dates = getAvailableReportDates({ scope });
    return reply.send({ dates });
  });

  app.get('/api/report/today', todayAuthHook, async (request, reply) => {
    const scope = normalizeReportScope(request.query?.scope ?? 'national');
    if (isRegionalReportScope(scope)) {
      if (!requireOperatorDistrictAccess(request, reply, scope)) return;
    }
    const requestedView = String(request.query?.view ?? 'operator').trim().toLowerCase();
    const dateParam = String(request.query?.date ?? '').trim();
    const data = getCachedReport(evidenceStore, { scope, date: dateParam || undefined });
    if (!data) {
      if (isRegionalReportScope(scope)) {
        return reply.send({
          found: false,
          code: 'regional_requires_assess_signals',
          hint: 'regional_requires_assess_signals',
          scope,
          message:
            `No ${scope}-scoped report found. Run assess-signals with --scope ${scope} after signal files exist.`,
        });
      }
      return reply.send({ found: false });
    }
    const display_view = resolveDisplayView({
      queryView: request.query?.view,
      canViewAnalyst: canViewAnalystDisplay(request.user?.email),
    });
    const analyst_denied = requestedView === DISPLAY_VIEWS.analyst
      && display_view !== DISPLAY_VIEWS.analyst;
    const redacted = redactReportPayload(data, display_view);
    const attention_items = buildAttentionItems(redacted.assessment, {
      view: display_view,
      reportScopeId: scope,
    });
    const action_compass = buildActionCompass(redacted.assessment, attention_items, {
      geoUnknownCount: countPendingGeoUnknown(geoUnknownReviewService),
    });
    const anomaly_strip = buildAnomalyStrip(redacted.assessment);
    const budget_status = crisisBudgetService?.getChatBudgetStatus?.() ?? null;
    const suggest_crisis_budget = crisisBudgetService?.shouldSuggestCrisisBudget?.(redacted.assessment) ?? false;

    return reply.send({
      found: true,
      display_view,
      attention_items,
      action_compass,
      anomaly_strip,
      budget_status,
      suggest_crisis_budget,
      ...(analyst_denied ? { analyst_denied: true, requested_view: DISPLAY_VIEWS.analyst } : {}),
      ...redacted,
    });
  });

  app.post('/api/report/recommendations/:id/acknowledge', {
    ...authHook,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', minLength: 1 } },
      },
      body: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          date: { type: 'string' },
          action: { type: 'string', enum: ['acknowledge', 'dismiss'] },
          rationale: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const parsed = parseOperatorRecommendationRequest({
      id: request.params?.id,
      scope: request.body?.scope ?? request.query?.scope,
      date: request.body?.date ?? request.query?.date,
      action: request.body?.action,
      rationale: request.body?.rationale,
    });
    if (!parsed.ok) {
      return reply.code(parsed.statusCode).send({ error: parsed.error });
    }

    const { recommendationId, scope, reportDate, action, rationale } = parsed;

    const data = getCachedReport(evidenceStore, { scope });
    const date = reportDate || data?.reportDate || data?.assessment?.date;
    if (!date) {
      return reply.code(404).send({ error: 'report_not_found' });
    }

    const result = updateOperatorRecommendationStatus(
      date,
      scope,
      recommendationId,
      { action, userEmail: request.user?.email ?? null, rationale },
    );

    if (!result.ok) {
      return reply.code(result.error === 'recommendation_not_found' ? 404 : 400).send({ error: result.error });
    }

    auditFromRequest(request, 'report.recommendation_ack', '/api/report/recommendations/:id/acknowledge', {
      recommendationId,
      action,
      scope,
      date,
    });

    return reply.send({ ok: true, recommendation: result.recommendation });
  });

  app.post('/api/video/download-url', costlyRoutePreHandlers(authPreHandlerList(authHook)), async (request, reply) => {
    const { url } = request.body ?? {};
    if (url == null || typeof url !== 'string' || !url.trim()) {
      return reply.code(400).send({ error: 'url is required' });
    }

    let safeUrl;
    try {
      safeUrl = validateUserFetchUrl(url.trim());
      const hostname = new URL(safeUrl).hostname;
      await assertResolvedHostSafe(hostname);
    } catch (err) {
      return reply.code(400).send({ error: err?.message ?? 'Invalid URL' });
    }

    await mkdir(videoDownloadDir, { recursive: true });

    const result = await videoGrabService.downloadFromUrl(safeUrl, videoDownloadDir);
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

  app.get('/api/municipalities', authHook, async (request, reply) => {
    try {
      const district = String(request.query?.district ?? 'north').trim();
      if (!requireOperatorDistrictAccess(request, reply, district)) return;
      const data = buildMunicipalityDashboardDto(district);
      return reply.send(data);
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load municipality data' });
    }
  });

  app.get('/api/pbo/districts', authHook, async (_request, reply) => {
    try {
      return reply.send(pboRegionalDailyService.listPboDistricts());
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load PBO districts' });
    }
  });

  app.get('/api/pbo/regional-report-days/:districtId/:regionId', authHook, async (request, reply) => {
    const { districtId, regionId } = request.params ?? {};
    if (!requireOperatorDistrictAccess(request, reply, String(districtId ?? ''))) return;
    try {
      const data = pboRegionalDailyService.getRegionalPboReportDays(
        String(districtId ?? ''),
        String(regionId ?? ''),
      );
      return reply.send(data);
    } catch (err) {
      if (err?.code === 'UNKNOWN_REGION') {
        return reply.code(400).send({ error: err.message, code: 'UNKNOWN_REGION' });
      }
      return reply.code(502).send({ error: err?.message ?? 'Failed to load regional PBO reports' });
    }
  });

  app.get('/api/pbo/regional-report-days/:regionId', authHook, async (request, reply) => {
    const { regionId } = request.params ?? {};
    if (!requireOperatorDistrictAccess(request, reply, 'north')) return;
    try {
      const data = pboRegionalDailyService.getRegionalPboReportDays('north', String(regionId ?? ''));
      return reply.send(data);
    } catch (err) {
      if (err?.code === 'UNKNOWN_REGION') {
        return reply.code(400).send({ error: err.message, code: 'UNKNOWN_REGION' });
      }
      return reply.code(502).send({ error: err?.message ?? 'Failed to load regional PBO reports' });
    }
  });

  app.post('/api/translate', costlyRoutePreHandlers(authPreHandlerList(authHook)), async (request, reply) => {
    auditFromRequest(request, 'translate.post', '/api/translate', {
      lang: request.body?.lang ?? null,
    });
    const { report, lang } = request.body ?? {};
    if (!report || !lang || lang === 'en') return reply.send({ report: report ?? null });
    if (process.env.TRANSLATION_ENABLED !== 'true') return reply.send({ report });
    try {
      if (!report.score_by_source) {
        const scope = normalizeReportScope(report.report_scope?.id ?? 'national');
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
