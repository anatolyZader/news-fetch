/**
 * Fetches main-news articles from all configured sites, LLM pre-filters for home-front relevance,
 * writes `articles-homefront.md` (or HOMEFRONT_MD).
 *
 * Filtering: Haiku on title + 200-char snippet.
 *
 * @module business_modules/news-sites/app/extractHomefrontArticles
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';

import Anthropic from '@anthropic-ai/sdk';
import { getTodayInTimezone } from '../../../utils/dateUtils.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';
import { createSourceArchive } from '../../../cross-cut-modules/source_archive/createSourceArchive.js';
import { persistOriginalSources } from '../../../cross-cut-modules/source_archive/persistOriginals.js';
import { buildMdSourceIdFromPath } from '../../../cross-cut-modules/source_archive/sourceId.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');
config({ path: join(repoRoot, '.env') });

const DEFAULT_HOMEFRONT_MD = 'business_modules/news-sites/articles_extracted/articles-homefront.md';

const SITE_ADAPTERS = {
  ynet:       () => import('../infrastructure/adapters/newsApiYnetAdapter.js'),
  haaretz:    () => import('../infrastructure/adapters/newsApiHaaretzAdapter.js'),
  maariv:     () => import('../infrastructure/adapters/newsApiMaarivAdapter.js'),
  walla:      () => import('../infrastructure/adapters/newsApiWallaAdapter.js'),
  mako:       () => import('../infrastructure/adapters/newsApiMakoAdapter.js'),
  n12:        () => import('../infrastructure/adapters/newsApiN12Adapter.js'),
  kan:        () => import('../infrastructure/adapters/newsApiKanAdapter.js'),
  kikar:      () => import('../infrastructure/adapters/newsApiKikarAdapter.js'),
  inn:        () => import('../infrastructure/adapters/newsApiInnAdapter.js'),
  ice:        () => import('../infrastructure/adapters/newsApiIceAdapter.js'),
  srugim:     () => import('../infrastructure/adapters/newsApiSrugimAdapter.js'),
  bhol:       () => import('../infrastructure/adapters/newsApiBholAdapter.js'),
  one:        () => import('../infrastructure/adapters/newsApiOneAdapter.js'),
  themarker:  () => import('../infrastructure/adapters/newsApiTheMarkerAdapter.js'),
  kipa:       () => import('../infrastructure/adapters/newsApiKipaAdapter.js'),
  globes:     () => import('../infrastructure/adapters/newsApiGlobesAdapter.js'),
  calcalist:  () => import('../infrastructure/adapters/newsApiCalcalistAdapter.js'),
  n0404:      () => import('../infrastructure/adapters/newsApi0404Adapter.js'),
  bokra:      () => import('../infrastructure/adapters/newsApiBokraAdapter.js'),
  arab48:     () => import('../infrastructure/adapters/newsApiArab48Adapter.js'),
  newsru:     () => import('../infrastructure/adapters/newsApiNewsruAdapter.js'),
  cursorinfo: () => import('../infrastructure/adapters/newsApiCursorinfoAdapter.js'),
  tv9:        () => import('../infrastructure/adapters/newsApi9tvAdapter.js'),
  vesty:      () => import('../infrastructure/adapters/newsApiVestyAdapter.js'),
  stmegi:     () => import('../infrastructure/adapters/newsApiStmegiAdapter.js'),
  toi:        () => import('../infrastructure/adapters/newsApiTimesOfIsraelAdapter.js'),
  jpost:      () => import('../infrastructure/adapters/newsApiJpostAdapter.js'),
  haaretzEng: () => import('../infrastructure/adapters/newsApiHaaretzEngAdapter.js'),
  ynetnews:   () => import('../infrastructure/adapters/newsApiYnetNewsAdapter.js'),
  inn_eng:    () => import('../infrastructure/adapters/newsApiIsraelNationalNewsAdapter.js'),
};

const SITE_LABELS = {
  ynet:       'Ynet',
  haaretz:    'Haaretz',
  maariv:     'Maariv',
  walla:      'Walla',
  mako:       'Mako',
  n12:        'N12 (Channel 12)',
  kan:        'KAN 11',
  kikar:      'Kikar Hashabat',
  inn:        'Arutz 7 (INN)',
  ice:        'ICE',
  srugim:     'Srugim',
  bhol:       'Bhol',
  one:        'One',
  themarker:  'TheMarker',
  kipa:       'Kipa',
  globes:     'Globes',
  calcalist:  'Calcalist',
  n0404:      '0404',
  bokra:      'Bokra (Arabic)',
  arab48:     'Arab48 (Arabic)',
  newsru:     'NewsRU Israel (Russian)',
  cursorinfo: 'Cursorinfo (Russian)',
  tv9:        '9TV Israel (Russian)',
  vesty:      'Vesty Israel (Russian)',
  stmegi:     'Stmegi (Russian)',
  toi:        'Times of Israel (English)',
  jpost:      'Jerusalem Post (English)',
  haaretzEng: 'Haaretz English',
  ynetnews:   'Ynet News (English)',
  inn_eng:    'Israel National News (English)',
};

const SITE_KEYS = Object.keys(SITE_ADAPTERS);

const FETCH_PREFILTER_SYSTEM_PROMPT =
  `You are a strict relevance classifier for community resilience behavioral analysis in Israel.\n` +
  `Select ONLY articles that describe concrete, observable behavior of the Israeli civilian population under current emergency conditions.\n\n` +
  `INCLUDE only if the title strongly suggests:\n` +
  `- Specific emergency actions: sheltering, evacuation, school closures/openings, civil defense instructions\n` +
  `- Institutional response: hospitals, municipalities, emergency services operating or failing\n` +
  `- Civilian mental health: psychological distress, trauma services, resilience programs\n` +
  `- Vulnerable populations under emergency: evacuees, elderly, disabled, special needs with concrete situation described\n` +
  `- Mutual aid, volunteering, or community solidarity acts in response to the security situation\n` +
  `- Economic disruption directly caused by the security situation: business closures, compensation, workforce impact\n` +
  `- Policy decisions with immediate civilian behavioral impact: shelter mandates, school policies, compensation rulings\n\n` +
  `EXCLUDE — even if the title mentions Israel or current events:\n` +
  `- Military operations, battlefield reports, weapons, enemy actions\n` +
  `- Political debates, coalition, government decisions without direct civilian behavioral impact\n` +
  `- Diplomatic, strategic, or international affairs\n` +
  `- Lifestyle, food, travel, entertainment, sports, culture, recipes, fashion\n` +
  `- General health or parenting advice not tied to the current emergency\n` +
  `- Weather unless it involves active emergency response (flood sheltering, evacuation)\n` +
  `- Crime, courts, business news, technology, science — unless directly linked to emergency civilian response\n` +
  `- Opinion pieces, editorials, analysis without behavioral facts described\n\n` +
  `When uncertain, INCLUDE.\n` +
  `Do NOT aim for any percentage target. Selection rate is irrelevant — only relevance matters.\n` +
  `Err on the side of inclusion: a false positive is filtered downstream; a false negative permanently loses behavioral evidence.\n\n` +
  `Return ONLY a JSON array of the article indices (the N from [N]): [1, 5, 12, ...]`;

const PREFILTER_BATCH_SIZE = Number.parseInt(process.env.PREFILTER_BATCH_SIZE || '400', 10);

function escapeMdHeading(s) {
  return String(s).replaceAll('#', String.raw`\#`).replaceAll('\n', ' ');
}

/** @param {string[]} sections @param {number} index @param {object} article */
function appendArticleSections(sections, index, article) {
  const body = article.body?.trim();
  sections.push(
    `## ${index + 1}. ${escapeMdHeading(article.title)}`,
    '',
    `- **URL:** ${article.url}`,
    `- **Published:** ${article.publishedAt}`,
    `- **Source:** ${article.source}`,
    '',
    body || '_No full text available._',
    '',
    '---',
    '',
  );
}

function buildBatchTitleList(batch, batchOffset) {
  return batch
    .map((a, i) => {
      const snippet = a.body?.trim().slice(0, 200);
      return snippet
        ? `[${batchOffset + i + 1}] ${a.title}\n   ${snippet}`
        : `[${batchOffset + i + 1}] ${a.title}`;
    })
    .join('\n');
}

async function createAnthropicMessageWithRetry(anthropic, { model, label, batch, titleList }) {
  const retries = 3;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await anthropic.messages.create({
        model,
        max_tokens: 8192,
        temperature: 0,
        system: FETCH_PREFILTER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Classify these ${batch.length} article titles:\n\n${titleList}` }],
      });
    } catch (err) {
      if (attempt === retries) throw err;
      const is429 = err.message?.includes('429') || err.status === 429;
      const wait = is429 ? 90000 : 5000 * attempt;
      console.error(`  ⚠ ${label} attempt ${attempt} failed (${err.message}) — retrying in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`${label} failed after ${retries} attempts`);
}

function parsePrefilterIndices(text, label) {
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart === -1 || arrEnd === -1) throw new Error(`${label} returned no JSON array`);
  const raw = text.slice(arrStart, arrEnd + 1);
  let indices;
  try {
    indices = JSON.parse(raw);
  } catch {
    const m = /\[[\d\s,]*\]/.exec(raw);
    if (!m) throw new Error(`${label} returned unparseable JSON: ${raw.slice(0, 200)}`);
    indices = JSON.parse(m[0]);
  }
  if (!Array.isArray(indices)) throw new Error(`${label}: expected JSON array of indices`);
  return new Set(indices.map(Number));
}

async function preFilterBatch(anthropic, batch, batchOffset, batchNum, totalBatches, onUsage) {
  const titleList = buildBatchTitleList(batch, batchOffset);
  const model = 'claude-haiku-4-5-20251001';
  const label = totalBatches > 1 ? `[pre-filter batch ${batchNum}/${totalBatches}]` : '[pre-filter]';
  const message = await createAnthropicMessageWithRetry(anthropic, { model, label, batch, titleList });

  if (message.stop_reason === 'max_tokens') {
    throw new Error(`${label} output truncated (max_tokens) — increase max_tokens`);
  }

  onUsage({ label, model, usage: message.usage });

  const text = message.content.find((b) => b.type === 'text')?.text ?? '';
  return parsePrefilterIndices(text, label);
}

async function preFilterByLLM(articles, onUsage) {
  if (articles.length === 0) return articles;

  const anthropic = new Anthropic();
  const batches = [];
  for (let i = 0; i < articles.length; i += PREFILTER_BATCH_SIZE) {
    batches.push({ batch: articles.slice(i, i + PREFILTER_BATCH_SIZE), offset: i });
  }

  console.error(`  → LLM pre-filter: classifying ${articles.length} articles in ${batches.length} batch(es)...`);

  const selectedSet = new Set();
  for (let b = 0; b < batches.length; b++) {
    if (b > 0) await new Promise((r) => setTimeout(r, 5000));
    const { batch, offset } = batches[b];
    const batchSelected = await preFilterBatch(anthropic, batch, offset, b + 1, batches.length, onUsage);
    for (const idx of batchSelected) selectedSet.add(idx);
  }

  const filtered = articles.filter((_, i) => selectedSet.has(i + 1));
  console.error(`  → pre-filter: ${filtered.length}/${articles.length} articles selected as homefront-relevant`);
  return filtered;
}

/**
 * @param {{ argv?: string[] }} [opts]
 */
export async function runExtractHomefrontArticles(opts = {}) {
  const argv = opts.argv ?? process.argv;
  const apiKey = (process.env.NEWSAPI_AI_KEY || process.env.NEWSAPI_API_KEY || process.env.NEWSAPI_KEY || '').trim();
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const outPath = (process.env.HOMEFRONT_MD || DEFAULT_HOMEFRONT_MD).trim() || DEFAULT_HOMEFRONT_MD;

  if (!apiKey) {
    console.error('Missing NEWSAPI_API_KEY (e.g. in .env).');
    process.exit(1);
  }

  checkDailyBudget();

  const { onUsage, getTotal } = createCostTracker({
    maxCostUsd: Number.parseFloat(process.env.MAX_COST_USD ?? '1.00'),
    label: 'extract-homefront',
  });

  const date = argv[2] || getTodayInTimezone(timezone);

  const allArticles = [];
  for (const site of SITE_KEYS) {
    const adapterModule = await SITE_ADAPTERS[site]();
    const createNewsApiArticlesFetcher = adapterModule.createNewsApiArticlesFetcher;
    const fetchArticlesForDay = createNewsApiArticlesFetcher({ apiKey, timezone });
    try {
      const articles = await fetchArticlesForDay({ date });
      const label = SITE_LABELS[site];
      for (const a of articles) {
        allArticles.push({ ...a, source: a.source || label });
      }
    } catch (err) {
      console.error(`Failed to fetch ${site}:`, err.message);
    }
  }

  const MAX_ARTICLES = Number.parseInt(process.env.HOMEFRONT_MAX_ARTICLES || '300', 10);

  const llmFiltered = await preFilterByLLM(allArticles, onUsage);

  const _seen = new Set();
  const deduped = llmFiltered.filter((a) => {
    const key = a.title.replaceAll(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
    if (_seen.has(key)) return false;
    _seen.add(key);
    return true;
  });

  const articles = deduped.length > MAX_ARTICLES ? deduped.slice(0, MAX_ARTICLES) : deduped;
  if (deduped.length > MAX_ARTICLES) {
    console.error(`  → capped at ${MAX_ARTICLES} articles (${deduped.length} after dedup)`);
  }

  const sections = [
    `# Home Front / population-in-emergency articles (${date})`,
    '',
    `For Home Front Command (פיקוד העורף) and population-behavior analysis.`,
    `Includes: psychoemotional state of the population; special/vulnerable populations.`,
    `Filtered from ${allArticles.length} main-news articles (all sites) → ${articles.length} relevant.`,
    '',
  ];

  for (let i = 0; i < articles.length; i++) {
    appendArticleSections(sections, i, articles[i]);
  }

  // Ensure the output directory exists (especially when using the default under business_modules/).
  mkdirSync(dirname(resolve(repoRoot, outPath)), { recursive: true });

  writeFileSync(outPath, sections.join('\n'), 'utf8');
  const datedOutPath = outPath.replace(/\.md$/, '') + `-${date}.md`;
  writeFileSync(datedOutPath, sections.join('\n'), 'utf8');
  console.log(`Wrote ${articles.length} home-front–relevant articles to ${outPath} and ${datedOutPath} (from ${allArticles.length} total)`);

  const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(repoRoot, 'db', 'app.sqlite');
  try {
    const archive = createSourceArchive(sqlitePath);
    const relMd = relative(repoRoot, datedOutPath).replaceAll('\\', '/');
    const items = articles.map((a, i) => ({
      source_id: buildMdSourceIdFromPath(repoRoot, datedOutPath, i + 1),
      date,
      source_type: 'news',
      source_label: a.source,
      source_url: a.url,
      title: a.title,
      body: a.body?.trim() ? a.body.trim() : '',
      published_at: a.publishedAt,
      module_ref: relMd,
    }));
    const { archived } = persistOriginalSources(archive, items);
    archive.close();
    console.log(`  → ${archived} source(s) archived (${sqlitePath})`);
  } catch (err) {
    console.error(`  ⚠ Source archive write failed (continuing): ${err.message}`);
  }

  const { totalCostUsd, usageLog } = getTotal();
  appendCostLog({ script: 'extract-homefront', date, totalCostUsd, usageLog, articles: articles.length });
}
