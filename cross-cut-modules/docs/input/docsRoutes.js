/**
 * Auth config, product docs, and OpenAPI routes.
 */

import { resolve } from 'node:path';
import { buildProductDocsIndex, loadProductDocPage } from '../../../utils/productDocs.js';
import { searchProductDocs } from '../../retrieval/docsRetrieval.js';
import { docsRagEnabled } from '../../retrieval/ragConfig.js';
import { httpDailyBudgetPreHandler } from '../../budget/app/httpDailyBudget.js';

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
    retrievalService = null,
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

  const docsSearchHooks = [httpDailyBudgetPreHandler];
  if (tryAuthHook?.preHandler) docsSearchHooks.unshift(tryAuthHook.preHandler);

  app.get('/api/docs/search', {
    preHandler: docsSearchHooks,
  }, async (request, reply) => {
    const query = String(request.query?.query ?? '').trim();
    if (!query) {
      return reply.code(400).send({ error: 'query parameter is required' });
    }
    if (!docsRagEnabled() || !retrievalService?.retrieval) {
      return reply.send({ enabled: false, hits: [] });
    }
    const isAuthed = !authRequired || !!request.user;
    const limit = Math.min(Number(request.query?.limit ?? 8) || 8, 15);
    const hits = await searchProductDocs(query, {
      retrieval: retrievalService.retrieval,
      topK: limit,
      includeGated: isAuthed,
    });
    return reply.send({ enabled: true, hits, query });
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

  app.get('/api/openapi.json', tryAuthHook, async (request, reply) => {
    if (!openapiDocument) return reply.code(404).send({ error: 'OpenAPI document not configured' });
    const isProd = process.env.NODE_ENV === 'production';
    const swaggerEnabled = process.env.ENABLE_SWAGGER === 'true';
    if (isProd && !swaggerEnabled && authRequired && !request.user) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'openapi_locked' });
    }
    return reply.send(openapiDocument);
  });
}

export function resolveProductDocsRoot(dirname) {
  return resolve(dirname, 'docs', 'product_docs');
}
