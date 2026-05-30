#!/usr/bin/env node
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRetrievalService } from '../createRetrievalService.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function main() {
  const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(REPO_ROOT, 'db', 'app.sqlite');
  const docsRoot = process.env.DOCS_ROOT?.trim() || resolve(REPO_ROOT, 'docs', 'product_docs');
  const svc = createRetrievalService({ dbPath: sqlitePath });
  const r = await svc.docsIndexWriter.reindexDocs({ docsRootDir: docsRoot });
  svc.rebuildFts();
  svc.close();
  console.error(
    `Docs RAG reindex: ${r.chunks} chunk(s) from ${r.pages} page(s), version ${r.corpus_version}`,
  );
}

main().catch((err) => {
  console.error('reindex-docs failed:', err.message);
  process.exit(1);
});
