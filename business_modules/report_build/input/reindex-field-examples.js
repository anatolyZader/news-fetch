#!/usr/bin/env node
import 'dotenv/config';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { resolveSqlitePath } from '../../../cross-cut-modules/config/sqlitePath.js';

async function main() {
  const sqlitePath = resolveSqlitePath();
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
