/**
 * Auth config, product docs, and OpenAPI routes.
 */

import { resolve } from 'node:path';
import { buildProductDocsIndex, loadProductDocPage } from '../../utils/productDocs.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export async function docsRoutes(app, opts) {
  const {
    authRequired,
    tryAuthHook,
    productDocsRoot,
    openapiDocument,
  } = opts;

  app.get('/api/docs/index', tryAuthHook, async (request, reply) => {
    const index = await buildProductDocsIndex({ docsRootDir: productDocsRoot });
    const isAuthed = !authRequired || !!request.user;
    const pages = index.pages.map((p) => ({
      ...p,
      locked: p.gated && !isAuthed,
    }));
    return reply.send({ pages });
  });

  app.get('/api/docs/page/:slug', tryAuthHook, async (request, reply) => {
    const slug = request.params?.slug;
    const page = await loadProductDocPage({ docsRootDir: productDocsRoot, slug });
    if (!page.ok) return reply.code(page.code).send({ error: page.error });
    if (authRequired && page.gated && !request.user) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'docs_page_locked' });
    }
    return reply.send({ meta: page.meta ?? {}, markdown: page.markdown ?? '' });
  });

  app.get('/api/openapi.json', async (_req, reply) => {
    if (!openapiDocument) return reply.code(404).send({ error: 'OpenAPI document not configured' });
    return reply.send(openapiDocument);
  });
}

export function resolveProductDocsRoot(dirname) {
  return resolve(dirname, 'docs', 'product_docs');
}
