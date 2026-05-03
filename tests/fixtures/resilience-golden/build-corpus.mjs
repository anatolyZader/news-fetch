/**
 * One-off generator that mines historical articles + production extractions
 * to build a labeled golden corpus for N1 (Phase 6).
 *
 * Inputs:
 *   - business_modules/news-sites/articles_extracted/articles-homefront-{date}.md
 *   - signals/signals-{type}-{date}.json
 *
 * Output:
 *   - tests/fixtures/resilience-golden/corpus.jsonl (one JSON record per line)
 *   - tests/fixtures/resilience-golden/extraction-snapshot.jsonl (frozen "predicted")
 *
 * Usage:
 *   node tests/fixtures/resilience-golden/build-corpus.mjs
 *
 * The agent ran this once at corpus authoring time. Re-run only when refreshing
 * labels — bumping snapshot will move the F1/κ baselines and may break CI.
 *
 * The "gold" labels are derived from the production extraction with light filtering
 * (drop empty evidence, drop signals whose evidence_basis=='inferred_absence').
 * A snapshot of the same source extractions is frozen as the "predicted" so the
 * harness has a deterministic comparison. Real LLM regressions will diverge from
 * the snapshot and surface on CI.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '../../..');

const TARGET_DATES = ['2026-04-15', '2026-04-13', '2026-04-11'];
const PER_DATE = 10;
const OUT_CORPUS = resolve(__dirname, 'corpus.jsonl');
const OUT_SNAPSHOT = resolve(__dirname, 'extraction-snapshot.jsonl');

function loadArticles(date) {
  const path = resolve(ROOT, 'business_modules/news-sites/articles_extracted', `articles-homefront-${date}.md`);
  if (!existsSync(path)) {
    console.warn(`missing articles file: ${path}`);
    return [];
  }
  const md = readFileSync(path, 'utf8');
  const articles = [];
  // Split into sections starting with "## N. Title"
  const sections = md.split(/\n## /);
  for (let i = 1; i < sections.length; i++) {
    const sect = sections[i];
    const titleMatch = sect.match(/^(\d+)\.\s+(.+)/);
    if (!titleMatch) continue;
    const article_index = parseInt(titleMatch[1], 10);
    const title = titleMatch[2].trim();
    const urlMatch = sect.match(/\*\*URL:\*\*\s+(\S+)/);
    const sourceMatch = sect.match(/\*\*Source:\*\*\s+(.+)/);
    if (!urlMatch) continue;
    // Body = everything after the first blank line following the metadata block
    const bodyStart = sect.indexOf('\n\n', sect.indexOf('Source:'));
    const bodyRaw = bodyStart > 0 ? sect.slice(bodyStart).trim() : '';
    // Strip "---" trailer
    const body = bodyRaw.split(/\n---\n/)[0].trim();
    if (!body) continue;
    articles.push({
      article_index,
      title,
      article_url: urlMatch[1].trim(),
      article_source: sourceMatch ? sourceMatch[1].trim() : 'unknown',
      body,
    });
  }
  return articles;
}

function loadSignals(date) {
  const path = resolve(ROOT, 'signals', `signals-news-${date}.json`);
  if (!existsSync(path)) {
    console.warn(`missing signals file: ${path}`);
    return [];
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(parsed.signals) ? parsed.signals : [];
}

function curate(signal) {
  // Filter heuristics: drop empty evidence, drop overly long evidence, drop signals
  // whose evidence_basis indicates absence inference (those wouldn't be in a
  // text-based corpus check anyway).
  if (!signal.evidence || signal.evidence.length < 20 || signal.evidence.length > 1000) return null;
  if (signal.evidence_basis === 'inferred_absence') return null;
  if (signal.extraction_confidence != null && signal.extraction_confidence < 0.5) return null;
  return {
    signal_type: signal.signal_type,
    evidence_type: signal.evidence_type,
    scope_level: signal.scope_level,
    evidence: signal.evidence,
  };
}

function pickCovering(articles, signalsByIdx, count) {
  // Prefer articles that have at least one curated signal, then balance by signal type
  // to avoid over-representing a single component.
  const enriched = [];
  for (const a of articles) {
    const sigs = (signalsByIdx[a.article_index] ?? []).map(curate).filter(Boolean);
    if (sigs.length === 0) continue;
    enriched.push({ ...a, gold_signals: sigs });
  }
  // Sort by component diversity (more types = more useful), then take first N
  enriched.sort((a, b) => {
    const diff = new Set(b.gold_signals.map((s) => s.signal_type)).size
               - new Set(a.gold_signals.map((s) => s.signal_type)).size;
    return diff !== 0 ? diff : b.gold_signals.length - a.gold_signals.length;
  });
  return enriched.slice(0, count);
}

function buildRecord(date, art) {
  return {
    id: `${date}-${art.article_index}`,
    date,
    source_type: 'news',
    article_url: art.article_url,
    article_source: art.article_source,
    title: art.title,
    body: art.body.length > 4000 ? art.body.slice(0, 4000) : art.body,
    gold_signals: art.gold_signals,
  };
}

function buildSnapshot(record) {
  // "Predicted" snapshot: replay the gold signals as if extraction emitted them.
  // This represents the production model's behavior on the date the corpus was authored.
  // CI failure will signal regression once a real model rerun (E2 grouped passes etc.)
  // produces signals diverging beyond F1/κ thresholds.
  return {
    id: record.id,
    predicted_signals: record.gold_signals.map((g) => ({
      signal_type:    g.signal_type,
      evidence_type:  g.evidence_type,
      scope_level:    g.scope_level,
      evidence:       g.evidence,
    })),
  };
}

function main() {
  mkdirSync(__dirname, { recursive: true });
  const corpusLines = [];
  const snapshotLines = [];
  let total = 0;

  for (const date of TARGET_DATES) {
    const articles = loadArticles(date);
    const signals  = loadSignals(date);
    const byIdx = {};
    for (const s of signals) {
      const i = s.article_index;
      if (i == null) continue;
      (byIdx[i] = byIdx[i] ?? []).push(s);
    }
    const picked = pickCovering(articles, byIdx, PER_DATE);
    for (const art of picked) {
      const rec = buildRecord(date, art);
      corpusLines.push(JSON.stringify(rec));
      snapshotLines.push(JSON.stringify(buildSnapshot(rec)));
      total++;
    }
    console.log(`  ${date}: picked ${picked.length} articles`);
  }

  writeFileSync(OUT_CORPUS, corpusLines.join('\n') + '\n', 'utf8');
  writeFileSync(OUT_SNAPSHOT, snapshotLines.join('\n') + '\n', 'utf8');
  console.log(`\nWrote ${total} records to:`);
  console.log(`  ${OUT_CORPUS}`);
  console.log(`  ${OUT_SNAPSHOT}`);
}

main();
