import { getTodayInTimezone, validateDate } from '../../../utils/dateUtils.js';
import { normalizeReportScopeId } from '../../geo/reportScopeIds.js';

/**
 * @param {string | null | undefined} dateRaw
 * @param {string} timezone
 */
function resolveQueryDate(dateRaw, timezone) {
  if (typeof dateRaw === 'string' && dateRaw.trim()) {
    return dateRaw.trim();
  }
  return getTodayInTimezone(timezone);
}

/**
 * Fastify routes for technical monitoring (pipeline, health, cost telemetry).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   monitoringService: ReturnType<import('../app/monitoringService.js').createMonitoringService>,
 *   authPreHandler?: Function,
 *   requireAnalystView?: (request: object, reply: object) => boolean,
 *   timezone?: string,
 * }} opts
 */
export async function registerMonitoringRoutes(app, opts) {
  const monitoringService = opts?.monitoringService ?? null;
  const authPreHandler = opts?.authPreHandler;
  const requireAnalystView = opts?.requireAnalystView ?? null;
  const timezone = opts?.timezone ?? process.env.TZ_ARTICLES ?? 'Asia/Jerusalem';

  const analystPreHandler = authPreHandler
    ? { preHandler: authPreHandler }
    : {};

  app.get('/api/monitoring/health', async (_request, reply) => {
    if (!monitoringService) {
      return reply.code(503).send({ error: 'monitoring service not configured' });
    }
    try {
      const data = await monitoringService.getHealth();
      const code = data.status === 'unhealthy' ? 503 : 200;
      return reply.code(code).send(data);
    } catch (err) {
      return reply.code(500).send({ error: err?.message ?? 'failed to compute health' });
    }
  });

  async function handlePipelineQuery(request, reply) {
    if (requireAnalystView && !requireAnalystView(request, reply)) return;
    if (!monitoringService) {
      return reply.code(503).send({ error: 'monitoring service not configured' });
    }

    const scope = normalizeReportScopeId(request.query?.scope ?? 'national');
    const date = resolveQueryDate(
      request.query?.date ?? request.query?.end_date ?? null,
      timezone,
    );

    if (!validateDate(date)) {
      return reply.code(400).send({ error: 'date must be YYYY-MM-DD' });
    }

    try {
      const data = await monitoringService.getPipelineStatus({ date, scope });
      return reply.send(data);
    } catch (err) {
      return reply.code(500).send({ error: err?.message ?? 'failed to compute pipeline status' });
    }
  }

  async function handleSummaryQuery(request, reply) {
    if (requireAnalystView && !requireAnalystView(request, reply)) return;
    if (!monitoringService) {
      return reply.code(503).send({ error: 'monitoring service not configured' });
    }

    const scope = normalizeReportScopeId(request.query?.scope ?? 'national');
    const date = resolveQueryDate(
      request.query?.date ?? request.query?.end_date ?? null,
      timezone,
    );

    if (!validateDate(date)) {
      return reply.code(400).send({ error: 'date must be YYYY-MM-DD' });
    }

    try {
      const data = await monitoringService.getSummary({ date, scope });
      return reply.send(data);
    } catch (err) {
      return reply.code(500).send({ error: err?.message ?? 'failed to compute monitoring summary' });
    }
  }

  app.get('/api/monitoring/pipeline', analystPreHandler, handlePipelineQuery);
  app.get('/api/monitoring/summary', analystPreHandler, handleSummaryQuery);

  /** @deprecated use GET /api/monitoring/pipeline */
  app.get('/api/pipeline/status', analystPreHandler, async (request, reply) => {
    await handlePipelineQuery(request, reply);
  });
}
