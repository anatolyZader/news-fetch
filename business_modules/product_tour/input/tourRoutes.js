/**
 * Fastify routes for product-tour progress (per-user onboarding state).
 */

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   tourService: ReturnType<import('../app/tourService.js').createTourService>,
 *   tryAuthPreHandler: (req: any, reply: any) => Promise<void>,
 *   allowAnonymous?: boolean,
 * }} opts
 */
export async function tourRoutes(app, opts) {
  const { tourService, tryAuthPreHandler, allowAnonymous = false } = opts;

  if (!tourService || !tryAuthPreHandler) {
    throw new Error('tourRoutes: missing required opts');
  }

  async function requireUserOrAllowedAnonymous(request, reply) {
    await tryAuthPreHandler(request, reply);
    if (!request.user) {
      if (allowAnonymous) {
        request.user = { uid: 'anonymous', email: null, anonymous: true };
        return;
      }
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  }

  const pre = { preHandler: requireUserOrAllowedAnonymous };

  app.get('/api/tour/progress', pre, async (request, reply) => {
    const result = tourService.getProgress({
      userUid: request.user.uid,
      tourId: request.query?.tourId,
    });
    if (result.error) return reply.code(result.code).send({ error: result.error });
    return reply.send(result);
  });

  app.put('/api/tour/progress', pre, async (request, reply) => {
    const body = request.body ?? {};
    const result = tourService.saveProgress({
      userUid: request.user.uid,
      tourId: body.tourId,
      status: body.status,
      lastStepIndex: body.lastStepIndex,
      seenVersion: body.seenVersion,
    });
    if (result.error) return reply.code(result.code).send({ error: result.error });
    return reply.send(result);
  });
}
