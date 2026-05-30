import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { docsRoutes, resolveProductDocsRoot } from '../../api/routes/docsRoutes.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

test('GET /api/docs/search validates query and returns hit shape', async () => {
  process.env.DOCS_RAG_ENABLED = '1';
  const app = Fastify();
  await docsRoutes(app, {
    authRequired: false,
    tryAuthHook: {},
    productDocsRoot: resolveProductDocsRoot(repoRoot),
    openapiDocument: null,
    retrievalService: {
      retrieval: {
        hybridRetrieve: async () => [
          {
            parentId: 'docs:getting-started/using-the-app',
            title: 'Using the app',
            text: 'slug: getting-started/using-the-app\ngated: false\n\nWelcome guide.',
            kind: 'docs_public',
            rrfScore: 0.9,
          },
        ],
      },
    },
  });

  const bad = await app.inject({ method: 'GET', url: '/api/docs/search?query=' });
  assert.equal(bad.statusCode, 400);

  const res = await app.inject({
    method: 'GET',
    url: '/api/docs/search?query=welcome&limit=5',
  });
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.enabled, true);
  assert.equal(body.query, 'welcome');
  assert.ok(Array.isArray(body.hits));
  assert.equal(body.hits[0].slug, 'getting-started/using-the-app');
  assert.ok(body.hits[0].snippet);
  await app.close();
});
