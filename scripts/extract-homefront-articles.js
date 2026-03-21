/**
 * Fetches main-news articles from all sites, keeps only those relevant to population
 * behavior in emergency and Home Front Command (פיקוד העורף), and writes them to a
 * single markdown file for analysis.
 *
 * Filtering: LLM pre-filter (Haiku) on title + 100-char snippet for all fetched articles.
 * This replaces the old keyword-based filter, which was too broad (49% pass rate).
 *
 * Usage: node scripts/extract-homefront-articles.js [date YYYY-MM-DD]
 * Output: articles-homefront.md (or HOMEFRONT_MD env)
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

import Anthropic from '@anthropic-ai/sdk';
import { getTodayInTimezone } from '../src/dateUtils.js';
import { PRICING, createCostTracker, appendCostLog, checkDailyBudget } from '../src/costTracker.js';

const SITE_ADAPTERS = {
  ynet:       () => import('../src/newsApiYnetAdapter.js'),
  haaretz:    () => import('../src/newsApiHaaretzAdapter.js'),
  maariv:     () => import('../src/newsApiMaarivAdapter.js'),
  walla:      () => import('../src/newsApiWallaAdapter.js'),
  mako:       () => import('../src/newsApiMakoAdapter.js'),
  n12:        () => import('../src/newsApiN12Adapter.js'),
  kan:        () => import('../src/newsApiKanAdapter.js'),
  kikar:      () => import('../src/newsApiKikarAdapter.js'),
  inn:        () => import('../src/newsApiInnAdapter.js'),
  ice:        () => import('../src/newsApiIceAdapter.js'),
  srugim:     () => import('../src/newsApiSrugimAdapter.js'),
  bhol:       () => import('../src/newsApiBholAdapter.js'),
  one:        () => import('../src/newsApiOneAdapter.js'),
  themarker:  () => import('../src/newsApiTheMarkerAdapter.js'),
  kipa:       () => import('../src/newsApiKipaAdapter.js'),
  globes:     () => import('../src/newsApiGlobesAdapter.js'),
  calcalist:  () => import('../src/newsApiCalcalistAdapter.js'),
  n0404:      () => import('../src/newsApi0404Adapter.js'),
  // Arabic — Israeli Arab community
  bokra:      () => import('../src/newsApiBokraAdapter.js'),
  arab48:     () => import('../src/newsApiArab48Adapter.js'),
  // Russian — Israeli Russian-speaking community
  newsru:     () => import('../src/newsApiNewsruAdapter.js'),
  cursorinfo: () => import('../src/newsApiCursorinfoAdapter.js'),
  tv9:        () => import('../src/newsApi9tvAdapter.js'),
  vesty:      () => import('../src/newsApiVestyAdapter.js'),
  stmegi:     () => import('../src/newsApiStmegiAdapter.js'),
  // English — Israeli English-language media
  toi:        () => import('../src/newsApiTimesOfIsraelAdapter.js'),
  jpost:      () => import('../src/newsApiJpostAdapter.js'),
  haaretzEng: () => import('../src/newsApiHaaretzEngAdapter.js'),
  ynetnews:   () => import('../src/newsApiYnetNewsAdapter.js'),
  inn_eng:    () => import('../src/newsApiIsraelNationalNewsAdapter.js'),
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

const apiKey = (process.env.NEWSAPI_AI_KEY || process.env.NEWSAPI_API_KEY || process.env.NEWSAPI_KEY || '').trim();
const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
const outPath = process.env.HOMEFRONT_MD || 'articles-homefront.md';

if (!apiKey) {
  console.error('Missing NEWSAPI_API_KEY (e.g. in .env).');
  process.exit(1);
}

checkDailyBudget();

const { onUsage, getTotal } = createCostTracker({ maxCostUsd: parseFloat(process.env.MAX_COST_USD ?? '0.20'), label: 'extract-homefront' });

const date = process.argv[2] || getTodayInTimezone(timezone);

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

// ─── LLM pre-filter ───────────────────────────────────────────────────────────

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

async function preFilterByLLM(articles) {
  if (articles.length === 0) return articles;

  const anthropic = new Anthropic(); // uses ANTHROPIC_API_KEY from env

  const titleList = articles
    .map((a, i) => {
      const snippet = a.body?.trim().slice(0, 200);
      return snippet
        ? `[${i + 1}] ${a.title}\n   ${snippet}`
        : `[${i + 1}] ${a.title}`;
    })
    .join('\n');

  console.error(`  → LLM pre-filter: classifying ${articles.length} articles by title + snippet...`);

  const model = 'claude-haiku-4-5-20251001';
  const retries = 3;
  let message;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      message = await anthropic.messages.create({
        model,
        max_tokens: 8192,
        temperature: 0,
        system: FETCH_PREFILTER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Classify these ${articles.length} article titles:\n\n${titleList}` }],
      });
      break;
    } catch (err) {
      if (attempt === retries) throw err;
      const is429 = err.message?.includes('429') || err.status === 429;
      const wait = is429 ? 90000 : 5000 * attempt;
      console.error(`  ⚠ pre-filter attempt ${attempt} failed (${err.message}) — retrying in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  if (message.stop_reason === 'max_tokens') {
    throw new Error('LLM pre-filter output truncated (max_tokens) — increase max_tokens');
  }

  onUsage({ label: '[pre-filter]', model, usage: message.usage });

  const text = message.content.find((b) => b.type === 'text')?.text ?? '';

  // Extract JSON array from response
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart === -1 || arrEnd === -1) throw new Error('LLM pre-filter returned no JSON array');
  const indices = JSON.parse(text.slice(arrStart, arrEnd + 1));
  if (!Array.isArray(indices)) throw new Error('LLM pre-filter: expected JSON array of indices');

  const indexSet = new Set(indices.map(Number));
  const filtered = articles.filter((_, i) => indexSet.has(i + 1));
  console.error(`  → pre-filter: ${filtered.length}/${articles.length} articles selected as homefront-relevant`);
  return filtered;
}

// ─── Deduplicate and filter ────────────────────────────────────────────────────

const MAX_ARTICLES = parseInt(process.env.HOMEFRONT_MAX_ARTICLES || '300', 10);

const llmFiltered = await preFilterByLLM(allArticles);

const _seen = new Set();
const deduped = llmFiltered.filter((a) => {
  const key = a.title.replace(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
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
  const a = articles[i];
  sections.push(`## ${i + 1}. ${escapeMdHeading(a.title)}`);
  sections.push('');
  sections.push(`- **URL:** ${a.url}`);
  sections.push(`- **Published:** ${a.publishedAt}`);
  sections.push(`- **Source:** ${a.source}`);
  sections.push('');
  sections.push(a.body && a.body.trim() ? a.body.trim() : '_No full text available._');
  sections.push('');
  sections.push('---');
  sections.push('');
}

function escapeMdHeading(s) {
  return String(s).replace(/#/g, '\\#').replace(/\n/g, ' ');
}

writeFileSync(outPath, sections.join('\n'), 'utf8');
console.log(`Wrote ${articles.length} home-front–relevant articles to ${outPath} (from ${allArticles.length} total)`);

const { totalCostUsd, usageLog } = getTotal();
appendCostLog({ script: 'extract-homefront', date, totalCostUsd, usageLog, articles: articles.length });
