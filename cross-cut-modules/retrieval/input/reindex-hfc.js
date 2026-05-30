#!/usr/bin/env node
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRetrievalService } from '../createRetrievalService.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function main() {
  const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(REPO_ROOT, 'db', 'app.sqlite');
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
