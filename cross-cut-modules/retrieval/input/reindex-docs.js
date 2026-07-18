#!/usr/bin/env node
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRetrievalService } from '../createRetrievalService.js';
import { resolveSqlitePath } from '../../config/sqlitePath.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

try {
  const sqlitePath = resolveSqlitePath(process.env, REPO_ROOT);
  const docsRoot = process.env.DOCS_ROOT?.trim()
    || resolve(REPO_ROOT, 'cross-cut-modules', 'docs', 'content', 'pages');
  const svc = createRetrievalService({ dbPath: sqlitePath });
  const r = await svc.docsIndexWriter.reindexDocs({ docsRootDir: docsRoot });
  svc.rebuildFts();
  svc.close();
  console.error(
    `Docs RAG reindex: ${r.chunks} chunk(s) from ${r.pages} page(s), version ${r.corpus_version}`,
  );
} catch (err) {
  console.error('reindex-docs failed:', err.message);
  process.exit(1);
}
