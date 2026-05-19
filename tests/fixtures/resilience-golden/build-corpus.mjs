/**
 * Mines historical articles + production extractions to build a labeled golden corpus (N1).
 *
 * Inputs:
 *   - business_modules/news-sites/articles_extracted/articles-homefront-{date}.md
 *   - signals/signals-{news,radio,field,pbo}-{date}.json whose `source_files` reference
 *     the matching `articles-homefront-{date}.md` (indices align with that MD only).
 *
 * Output:
 *   - tests/fixtures/resilience-golden/corpus.jsonl
 *   - tests/fixtures/resilience-golden/extraction-snapshot.jsonl
 *
 * Usage:
 *   node tests/fixtures/resilience-golden/build-corpus.mjs
 *
 * Re-run locally with RESILIENCE_REFRESH_GOLDEN=1 via golden-corpus.test.js, or run this
 * script directly. Refreshing changes F1/κ baselines — commit intentionally.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '../../..');

const SIGNAL_STEMS = ['news', 'radio', 'pbo', 'field'];
const MAX_CORPUS = 80;
const PER_DATE = 12;

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
    const bodyStart = sect.indexOf('\n\n', sect.indexOf('Source:'));
    const bodyRaw = bodyStart > 0 ? sect.slice(bodyStart).trim() : '';
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

function discoverDatesWithHomefrontSignals() {
  const articlesDir = resolve(ROOT, 'business_modules/news-sites/articles_extracted');
  const articleDates = new Set();
  if (existsSync(articlesDir)) {
    for (const f of readdirSync(articlesDir)) {
      const m = /^articles-homefront-(\d{4}-\d{2}-\d{2})\.md$/.exec(f);
      if (m) articleDates.add(m[1]);
    }
  }

  const signalsDir = resolve(ROOT, 'signals');
  const eligible = new Set();
  if (!existsSync(signalsDir)) return [];

  for (const f of readdirSync(signalsDir)) {
    const m = /^signals-(news|radio|pbo|field)-(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
    if (!m || !SIGNAL_STEMS.includes(m[1])) continue;
    const date = m[2];
    if (!articleDates.has(date)) continue;
    const full = resolve(signalsDir, f);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(full, 'utf8'));
    } catch {
      continue;
    }
    const files = parsed.source_files ?? [];
    const usesHomefront = files.some((x) =>
      typeof x === 'string' && x.includes(`articles-homefront-${date}`));
    if (!usesHomefront) continue;
    eligible.add(date);
  }

  return [...eligible].sort().reverse();
}

function loadMergedSignalsForDate(date) {
  const signalsDir = resolve(ROOT, 'signals');
  const merged = [];
  if (!existsSync(signalsDir)) return merged;

  for (const stem of SIGNAL_STEMS) {
    const path = resolve(signalsDir, `signals-${stem}-${date}.json`);
    if (!existsSync(path)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    const files = parsed.source_files ?? [];
    const usesHomefront = files.some((x) =>
      typeof x === 'string' && x.includes(`articles-homefront-${date}`));
    if (!usesHomefront) continue;
    const sigs = Array.isArray(parsed.signals) ? parsed.signals : [];
    for (const s of sigs) {
      merged.push({
        ...s,
        source_type: s.source_type ?? parsed.source_type ?? stem,
      });
    }
  }
  return merged;
}

function curate(signal) {
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
  const enriched = [];
  for (const a of articles) {
    const sigs = (signalsByIdx[a.article_index] ?? []).map(curate).filter(Boolean);
    if (sigs.length === 0) continue;
    enriched.push({ ...a, gold_signals: sigs });
  }
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

  const dates = discoverDatesWithHomefrontSignals();
  if (dates.length === 0) {
    console.warn('No dates found with homefront-aligned signal bundles — nothing written.');
    return;
  }

  for (const date of dates) {
    if (total >= MAX_CORPUS) break;
    const articles = loadArticles(date);
    const signals = loadMergedSignalsForDate(date);
    const byIdx = {};
    for (const s of signals) {
      const i = s.article_index;
      if (i == null) continue;
      (byIdx[i] = byIdx[i] ?? []).push(s);
    }
    const budget = Math.min(PER_DATE, MAX_CORPUS - total);
    const picked = pickCovering(articles, byIdx, budget);
    for (const art of picked) {
      const rec = buildRecord(date, art);
      corpusLines.push(JSON.stringify(rec));
      snapshotLines.push(JSON.stringify(buildSnapshot(rec)));
      total++;
    }
    console.log(`  ${date}: picked ${picked.length} articles (running total ${total})`);
  }

  writeFileSync(OUT_CORPUS, corpusLines.join('\n') + '\n', 'utf8');
  writeFileSync(OUT_SNAPSHOT, snapshotLines.join('\n') + '\n', 'utf8');
  console.log(`\nWrote ${total} records to:`);
  console.log(`  ${OUT_CORPUS}`);
  console.log(`  ${OUT_SNAPSHOT}`);
}

main();
