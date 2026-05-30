#!/usr/bin/env node
/**
 * Reindex signal catalog into rag_chunks (namespace=catalog).
 */
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { createCatalogIndexWriter } from '../../../cross-cut-modules/retrieval/catalogIndexWriter.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

try {
  const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(REPO_ROOT, 'db', 'app.sqlite');
  const svc = createRetrievalService({ dbPath: sqlitePath });
  const catalogWriter = createCatalogIndexWriter(svc.indexWriter);
  const r = await catalogWriter.reindexCatalog();
  svc.rebuildFts();
  svc.close();
  console.error(`Catalog RAG reindex: ${r.chunks} chunk(s), version ${r.catalog_version}`);
} catch (err) {
  console.error('reindex-catalog failed:', err.message);
  process.exit(1);
}
