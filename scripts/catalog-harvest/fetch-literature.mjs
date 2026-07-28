#!/usr/bin/env node
/**
 * Stage 1 of the catalog-harvest pipeline: build a slim literature corpus for
 * candidate-signal extraction, from free keyless APIs only (OpenAlex; optional
 * Semantic Scholar TLDR enrichment). No external $ meter — only Claude tokens
 * downstream, so entries are kept slim (title + abstract, no full PDFs).
 *
 * Flow: resolve each anchor in anchors.json by title search → expand its
 * citation graph (works citing the anchor) → run recent keyword searches →
 * relevance-filter, dedupe, rank, cap.
 *
 * Usage: node scripts/catalog-harvest/fetch-literature.mjs [options]
 *   --out <path>       output corpus JSON (default: stdout)
 *   --max <n>          cap on total corpus entries (default 40)
 *   --per-anchor <n>   citing works fetched per anchor (default 25)
 *   --tldr             enrich top entries with Semantic Scholar TLDRs (slow, rate-limited)
 *   --anchors <path>   alternative anchors config (default: scripts/catalog-harvest/anchors.json)
 *
 * Set OPENALEX_MAILTO=<email> to join OpenAlex's polite pool (faster, optional).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OPENALEX = 'https://api.openalex.org';

const args = process.argv.slice(2);
const argVal = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : dflt;
};
const outPath = argVal('--out', null);
const maxTotal = Number(argVal('--max', 40));
const perAnchor = Number(argVal('--per-anchor', 25));
const wantTldr = args.includes('--tldr');
const anchorsPath = argVal('--anchors', path.join(HERE, 'anchors.json'));

const config = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
const relevanceTerms = (config.relevance_terms ?? []).map((t) => t.toLowerCase());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, { retries = 3 } = {}) {
  const mailto = process.env.OPENALEX_MAILTO;
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = mailto && url.startsWith(OPENALEX) ? `${url}${sep}mailto=${encodeURIComponent(mailto)}` : url;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(fullUrl, { headers: { 'User-Agent': 'catalog-harvest/1.0' } });
      if (res.status === 429) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
  return null;
}

/** OpenAlex ships abstracts as {word: [positions]} — rebuild plain text. */
function decodeAbstract(invertedIndex) {
  if (!invertedIndex) return null;
  const slots = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) slots[pos] = word;
  }
  return slots.filter(Boolean).join(' ');
}

function relevanceScore(text) {
  const lower = text.toLowerCase();
  return relevanceTerms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

function slimWork(work, sourceKey) {
  const abstract = decodeAbstract(work.abstract_inverted_index);
  const title = work.display_name ?? work.title ?? '';
  return {
    id: work.id,
    doi: work.doi ?? null,
    title,
    year: work.publication_year ?? null,
    venue: work.primary_location?.source?.display_name ?? null,
    authors: (work.authorships ?? []).slice(0, 3).map((a) => a.author?.display_name).filter(Boolean),
    cited_by_count: work.cited_by_count ?? 0,
    oa_url: work.open_access?.oa_url ?? work.primary_location?.pdf_url ?? null,
    is_oa: work.open_access?.is_oa ?? false,
    source: sourceKey,
    relevance_score: relevanceScore(`${title} ${abstract ?? ''}`),
    abstract: abstract ? abstract.slice(0, 1800) : null,
  };
}

async function resolveAnchor(anchor) {
  const titleUrl = `${OPENALEX}/works?filter=title.search:${encodeURIComponent(anchor.query)}&per-page=5`;
  let results = (await getJson(titleUrl))?.results ?? [];
  if (!results.length) {
    const url = `${OPENALEX}/works?search=${encodeURIComponent(anchor.query)}&per-page=5`;
    results = (await getJson(url))?.results ?? [];
  }
  if (!results.length) {
    console.error(`  ✗ anchor "${anchor.key}": no OpenAlex match`);
    return null;
  }
  // anchors use exact titles, so OpenAlex's own relevance ranking is reliable
  const best = results[0];
  console.error(`  ✓ anchor "${anchor.key}" → ${best.id} "${(best.display_name ?? '').slice(0, 80)}" (${best.cited_by_count} citations)`);
  return best;
}

async function citingWorks(anchorWork, anchorKey) {
  const workId = anchorWork.id.split('/').pop();
  const url = `${OPENALEX}/works?filter=cites:${workId}&sort=cited_by_count:desc&per-page=${perAnchor}`;
  const data = await getJson(url);
  return (data?.results ?? []).map((w) => slimWork(w, `cites:${anchorKey}`));
}

async function recentSearch(search) {
  const filter = search.from ? `&filter=from_publication_date:${search.from}` : '';
  const url = `${OPENALEX}/works?search=${encodeURIComponent(search.query)}${filter}&per-page=${perAnchor}`;
  const data = await getJson(url);
  return (data?.results ?? []).map((w) => slimWork(w, `search:${search.key}`));
}

async function enrichTldrs(entries) {
  for (const entry of entries) {
    if (!entry.doi) continue;
    const doi = entry.doi.replace(/^https?:\/\/doi\.org\//, '');
    try {
      const data = await getJson(
        `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=tldr`,
        { retries: 1 },
      );
      if (data?.tldr?.text) entry.tldr = data.tldr.text;
    } catch {
      // TLDR is best-effort
    }
    await sleep(1200); // keyless S2 rate limit
  }
}

async function main() {
  console.error('Resolving anchors on OpenAlex…');
  const anchorEntries = [];
  const corpus = [];

  for (const anchor of config.anchors ?? []) {
    const work = await resolveAnchor(anchor);
    if (!work) continue;
    anchorEntries.push({ ...slimWork(work, `anchor:${anchor.key}`), note: anchor.note ?? null });
    const citing = await citingWorks(work, anchor.key);
    console.error(`    ${citing.length} citing works fetched`);
    corpus.push(...citing);
    await sleep(250);
  }

  for (const search of config.recent_searches ?? []) {
    const results = await recentSearch(search);
    console.error(`  ✓ search "${search.key}": ${results.length} works`);
    corpus.push(...results);
    await sleep(250);
  }

  // dedupe by id (keep highest-relevance source attribution), require abstract + some relevance
  const byId = new Map();
  for (const entry of corpus) {
    const existing = byId.get(entry.id);
    if (!existing || entry.relevance_score > existing.relevance_score) byId.set(entry.id, entry);
  }
  const anchorIds = new Set(anchorEntries.map((a) => a.id));
  const ranked = [...byId.values()]
    .filter((e) => !anchorIds.has(e.id))
    .filter((e) => e.abstract && e.relevance_score >= 2)
    .sort((a, b) => b.relevance_score - a.relevance_score || b.cited_by_count - a.cited_by_count)
    .slice(0, maxTotal);

  if (wantTldr) {
    console.error(`Enriching ${ranked.length} entries with S2 TLDRs…`);
    await enrichTldrs(ranked);
  }

  const out = {
    generated_at: new Date().toISOString(),
    anchors: anchorEntries,
    corpus_size: ranked.length,
    dropped_no_abstract_or_low_relevance: byId.size - anchorEntries.length - ranked.length,
    corpus: ranked,
  };

  const json = JSON.stringify(out, null, 2);
  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, json);
    console.error(`Wrote ${outPath} (${ranked.length} corpus entries, ${anchorEntries.length} anchors)`);
  } else {
    console.log(json);
  }
}

try {
  await main();
} catch (err) {
  console.error(err.message ?? err);
  process.exit(1);
}
