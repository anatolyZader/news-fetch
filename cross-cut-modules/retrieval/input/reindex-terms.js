#!/usr/bin/env node
import 'dotenv/config';
import { createRetrievalService } from '../createRetrievalService.js';
import { resolveSqlitePath } from '../../config/sqlitePath.js';

async function main() {
  const sqlitePath = resolveSqlitePath();
  const svc = createRetrievalService({ dbPath: sqlitePath });
  const r = await svc.translationGlossaryIndexWriter.reindexTerms();
  svc.rebuildFts();
  svc.close();
  console.error(`Translation terms RAG reindex: ${r.chunks} chunk(s) from ${r.terms} term(s)`);
}

main().catch((err) => {
  console.error('reindex-terms failed:', err.message);
  process.exit(1);
});
