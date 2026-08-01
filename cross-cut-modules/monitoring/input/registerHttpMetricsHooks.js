import { METRIC } from '../domain/metricNames.js';

const MAX_DISTINCT_ROUTES = 200;

/**
 * Global request-latency instrumentation. Hijacked replies (SSE) skip the
 * Fastify lifecycle and never reach onResponse — chat records its own
 * chat.turn.duration_ms instead.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ metricsPort?: { histogram: Function, increment: Function } | null }} opts
 */
export function registerHttpMetricsHooks(app, opts = {}) {
  const metricsPort = opts.metricsPort ?? null;
  if (!metricsPort) return;

  const seenRoutes = new Set();

  app.addHook('onResponse', async (request, reply) => {
    const rawRoute = request.routeOptions?.url ?? '__unmatched__';
    let route = rawRoute;
    if (!seenRoutes.has(rawRoute)) {
      if (seenRoutes.size >= MAX_DISTINCT_ROUTES) route = '__other__';
      else seenRoutes.add(rawRoute);
    }
    const labels = {
      route,
      method: request.method,
      status: `${Math.floor(reply.statusCode / 100)}xx`,
    };
    metricsPort.histogram(METRIC.HTTP_REQUEST_DURATION, reply.elapsedTime, labels);
    metricsPort.increment(METRIC.HTTP_REQUESTS, 1, { status: labels.status });
  });
}
