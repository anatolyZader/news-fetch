/**
 * Map AppError instances to Fastify reply payloads.
 */

import { isAppError } from './AppError.js';

/**
 * @param {import('fastify').FastifyInstance} app
 */
export function registerAppErrorHandler(app) {
  app.setErrorHandler((err, _request, reply) => {
    if (isAppError(err)) {
      return reply.code(err.statusCode).send({
        error: err.message,
        code: err.code,
        ...(err.details == null ? {} : { details: err.details }),
      });
    }
    const statusCode = err?.statusCode ?? err?.status ?? 500;
    return reply.code(statusCode).send({
      error: err?.message ?? 'Internal Server Error',
      code: 'internal_error',
    });
  });
}
