#!/usr/bin/env node
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function getArg(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

async function main() {
  const days = Number.parseInt(getArg(process.argv, '--days') ?? '30', 10) || 30;
  const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(REPO_ROOT, 'db', 'app.sqlite');
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
