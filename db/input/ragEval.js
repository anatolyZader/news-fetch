#!/usr/bin/env node
/**
 * RAG retrieval regression (fixture-driven suite).
 *
 * Usage: node db/input/ragEval.js
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRetrievalService } from '../../cross-cut-modules/retrieval/createRetrievalService.js';
import { searchProductDocs } from '../../cross-cut-modules/retrieval/docsRetrieval.js';
import { DOCS_INDEX_DATE } from '../../cross-cut-modules/retrieval/docsIndexWriter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

function loadFixture(name) {
  const path = resolve(repoRoot, 'tests/fixtures', name);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function runArchiveSuite(svc, fixtures) {
  let pass = 0;
  let fail = 0;

  for (const fx of fixtures) {
    await svc.indexArchiveRow({
      source_id: fx.fixture_source_id,
      date: '2026-03-15',
      source_type: 'news',
      title: 'eval',
      body: fx.body,
      scope_id: fx.scope_id ?? null,
    });
  }
  svc.rebuildFts();

  for (const fx of fixtures) {
    if (fx.expect === 'skip') {
      console.log(`SKIP  ${fx.query} (filesystem fallback — not seeded in DB)`);
      continue;
    }
    const reportScope = fx.scope_id === 'north'
      ? { id: 'north', label: 'North' }
      : { id: 'national', label: 'National' };
    const hits = await svc.retrieval.retrieve({
      query: fx.query,
      reportData: { assessment: { date: '2026-03-15', report_scope: reportScope } },
      reportGeoScope: fx.scope_id === 'north' ? 'north' : 'national',
      dateWindowDays: 1,
      topKFinal: 5,
    });
    const found = hits.some((h) => (h.parentId ?? '').includes(fx.fixture_source_id));
    if (found) {
      pass++;
      console.log(`PASS  archive ${fx.query}`);
    } else {
      fail++;
      console.log(`FAIL  archive ${fx.query} (top: ${hits[0]?.parentId ?? 'none'})`);
    }
  }
  return { pass, fail };
}

async function runDocsSuite(svc, fixtures) {
  let pass = 0;
  let fail = 0;

  for (const fx of fixtures) {
    await svc.indexWriter.indexChunksForParent({
      namespace: 'docs',
      parentId: `docs:${fx.fixture_slug}`,
      date: DOCS_INDEX_DATE,
      body: `slug: ${fx.fixture_slug}\ntitle: Eval doc\ngated: false\n\n${fx.body}`,
      sourceType: 'docs',
      title: 'Eval doc',
      kind: 'docs_public',
      scopeId: 'eval',
    });
  }
  svc.rebuildFts();

  for (const fx of fixtures) {
    const hits = await searchProductDocs(fx.query, { retrieval: svc.retrieval, topK: 5 });
    const found = hits.some((h) => h.slug === fx.fixture_slug);
    if (found) {
      pass++;
      console.log(`PASS  docs ${fx.query}`);
    } else {
      fail++;
      console.log(`FAIL  docs ${fx.query} (top: ${hits[0]?.slug ?? 'none'})`);
    }
  }
  return { pass, fail };
}

async function main() {
  const sqlitePath = process.env.SQLITE_PATH?.trim()
    ? resolve(process.env.SQLITE_PATH.trim())
    : resolve(repoRoot, 'db', 'app.sqlite');

  process.env.RAG_PIPELINE_ENABLED = process.env.RAG_PIPELINE_ENABLED ?? '1';
  process.env.DOCS_RAG_ENABLED = process.env.DOCS_RAG_ENABLED ?? '1';

  const svc = createRetrievalService({ dbPath: sqlitePath });
  let pass = 0;
  let fail = 0;

  const archiveFixtures = [
    ...loadFixture('rag-golden.he.json'),
    ...loadFixture('rag-golden-north.json'),
  ];
  const archiveResult = await runArchiveSuite(svc, archiveFixtures);
  pass += archiveResult.pass;
  fail += archiveResult.fail;

  const docsResult = await runDocsSuite(svc, loadFixture('rag-golden-docs.json'));
  pass += docsResult.pass;
  fail += docsResult.fail;

  for (const fx of loadFixture('rag-golden-fallback.json')) {
    console.log(`SKIP  ${fx.query} (${fx.expect ?? 'fallback'} — eval documents filesystem-only path)`);
  }

  svc.close();
  console.log(`rag:eval ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

try {
  await main();
} catch (err) {
  console.error('ragEval failed:', err.message);
  process.exit(1);
}
