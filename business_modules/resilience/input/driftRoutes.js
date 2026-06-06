import { requireAnalystView } from '../../../cross-cut-modules/auth/requireAnalystAccess.js';
import { normalizeReportScope } from '../domain/services/regionSignalFilter.js';

/**
 * Fastify routes for the resilience drift dashboard (N4).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   driftService: ReturnType<import('../app/driftService.js').createDriftService>,
 *   authPreHandler?: Function,
 * }} opts
 */
export async function registerDriftRoutes(app, opts) {
  const driftService = opts?.driftService ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/resilience/drift/agent-severity', preHandler, async (request, reply) => {
    if (!requireAnalystView(request, reply)) return;
    const scope = normalizeReportScope(request.query?.scope ?? 'national');
    const days = Math.min(Number.parseInt(request.query?.days ?? '30', 10) || 30, 90);
    const { readdirSync, readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'daily_reports');
    if (!existsSync(dir)) return reply.send({ series: [] });
    const points = [];
    for (const f of readdirSync(dir).filter((n) => n.startsWith('divergence-'))) {
      try {
        const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        if (data.scopeId !== scope && data.scope !== scope) continue;
        points.push({
          date: data.date,
          alignment_rate: data.alignment_rate,
          by_component: data.by_component,
        });
      } catch { /* skip */ }
    }
    points.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return reply.send({ scope, days, series: points.slice(-days) });
  });

  app.get('/api/resilience/drift', preHandler, async (request, reply) => {
    if (!requireAnalystView(request, reply)) return;
    if (!driftService) {
      return reply.code(503).send({ error: 'drift service not configured' });
    }
    const scope = normalizeReportScope(request.query?.scope ?? 'national');
    const daysRaw = request.query?.days;
    const endDateRaw = request.query?.end_date ?? request.query?.endDate ?? null;
    const days = (() => {
      const n = Number.parseInt(daysRaw ?? '30', 10);
      if (!Number.isFinite(n) || n <= 0) return 30;
      return Math.min(n, 90);
    })();
    try {
      const endDate =
        typeof endDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDateRaw.trim())
          ? endDateRaw.trim()
          : undefined;
      const data = driftService.compute({ scope, days, endDate });
      return reply.send(data);
    } catch (err) {
      return reply.code(500).send({ error: err?.message ?? 'failed to compute drift' });
    }
  });
}
