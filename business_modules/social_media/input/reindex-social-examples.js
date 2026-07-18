#!/usr/bin/env node
import 'dotenv/config';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';
import { resolveSqlitePath } from '../../../cross-cut-modules/config/sqlitePath.js';

function getArg(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

async function main() {
  const days = Number.parseInt(getArg(process.argv, '--days') ?? '30', 10) || 30;
  const sqlitePath = resolveSqlitePath();
  const svc = createRetrievalService({ dbPath: sqlitePath });
  const r = await svc.socialExamplesIndexWriter.reindexSocialExamples({ days });
  svc.rebuildFts();
  svc.close();
  console.error(`Social examples RAG reindex: ${r.chunks} chunk(s) from ${r.files} file(s)`);
}

main().catch((err) => {
  console.error('reindex-social-examples failed:', err.message);
  process.exit(1);
});
