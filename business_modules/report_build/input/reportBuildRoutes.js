/**
 * Fastify routes for interactive report building (web UI).
 *
 * Auth is required (relies on request.user.uid set by existing auth hook).
 */

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ reportBuildService: any, authPreHandler?: any }} opts
 */
export async function reportBuildRoutes(app, opts) {
  const reportBuildService = opts?.reportBuildService ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  function requireService(reply) {
    if (reportBuildService) return true;
    reply.code(503).send({ error: 'report build service not configured' });
    return false;
  }

  app.post('/api/report-build/start', preHandler, async (request, reply) => {
    if (!requireService(reply)) return;
    const ownerKey = request.user?.uid;
    if (!ownerKey) return reply.code(401).send({ error: 'Unauthorized' });
    const out = reportBuildService.startSession({ ownerKey });
    return reply.send(out);
  });

  app.post('/api/report-build/turn', preHandler, async (request, reply) => {
    if (!requireService(reply)) return;
    const ownerKey = request.user?.uid;
    if (!ownerKey) return reply.code(401).send({ error: 'Unauthorized' });
    const { text } = request.body ?? {};
    if (typeof text !== 'string' || !text.trim()) {
      return reply.code(400).send({ error: 'text is required' });
    }
    const displayName = request.user?.name ?? request.user?.email ?? '';
    const out = await reportBuildService.applyTurn({ ownerKey, text, displayName, role: 'officer' });
    return reply.send(out);
  });

  app.post('/api/report-build/confirm', preHandler, async (request, reply) => {
    if (!requireService(reply)) return;
    const ownerKey = request.user?.uid;
    if (!ownerKey) return reply.code(401).send({ error: 'Unauthorized' });
    const out = reportBuildService.confirmAndClose({ ownerKey });
    return reply.send(out);
  });

  app.post('/api/report-build/cancel', preHandler, async (request, reply) => {
    if (!requireService(reply)) return;
    const ownerKey = request.user?.uid;
    if (!ownerKey) return reply.code(401).send({ error: 'Unauthorized' });
    const out = reportBuildService.cancel({ ownerKey });
    return reply.send(out);
  });
}

