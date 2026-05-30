#!/usr/bin/env node
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function main() {
  const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(REPO_ROOT, 'db', 'app.sqlite');
  const svc = createRetrievalService({ dbPath: sqlitePath });
  const r = await svc.fieldExamplesIndexWriter.reindexFieldExamples();
  svc.rebuildFts();
  svc.close();
  console.error(`Field examples RAG reindex: ${r.chunks} chunk(s)`);
}

main().catch((err) => {
  console.error('reindex-field-examples failed:', err.message);
  process.exit(1);
});
