#!/usr/bin/env node
import 'dotenv/config';
import { createRetrievalService } from '../createRetrievalService.js';
import { resolveSqlitePath } from '../../config/sqlitePath.js';

async function main() {
  const sqlitePath = resolveSqlitePath();
  const svc = createRetrievalService({ dbPath: sqlitePath });
  const r = await svc.hfcGuidelinesIndexWriter.reindexHfcGuidelines();
  svc.rebuildFts();
  svc.close();
  console.error(`HFC guidelines RAG reindex: ${r.chunks} chunk(s), ${r.sections} section(s)`);
}

main().catch((err) => {
  console.error('reindex-hfc failed:', err.message);
  process.exit(1);
});
