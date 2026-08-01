import { createHash } from 'node:crypto';
import { getDefaultLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { transportMeta } from '../../../cross-cut-modules/llm/resolveLlmPort.js';
import { SONNET_MODEL } from '../../../cross-cut-modules/llm/modelIds.js';
import { jsonrepair } from 'jsonrepair';
import { readFile } from 'node:fs/promises';
import { writeFileAtomic } from '../../../cross-cut-modules/persistence/infrastructure/writeFileAtomic.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcInvocationCostUsd } from '../../../cross-cut-modules/budget/index.js';
import { appendCostLog } from '../../../cross-cut-modules/log/index.js';
import {
  isTransientTranslateError,
  runWithConcurrencyLimit,
  sleep,
} from './translationTranslateUtils.js';
import { translateGenericJsonWithRetry, translateProseWithRetry, LANG_NAMES } from './translateGenericJson.js';
import { detectSourceLang, shouldSkipTranslation } from './detectSourceLang.js';
import { translationLocaleDir } from '../domain/services/artifactPaths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOCALE_DIR = translationLocaleDir(resolve(__dirname, '../../..'));

/** In-memory cache to avoid disk reads on repeat requests */
const memCache = new Map();
const socialMemCache = new Map();

/** @type {string | null} */
let reportsDirOverride = null;

const SOCIAL_POST_SYSTEM_PROMPT = {
  en: `You translate citizen social-media posts about the Israeli home front and civil defense into clear, natural English. Preserve URLs, @handles, and hashtags. Return ONLY valid JSON with the exact same structure as the input.`,
  he: `You translate social-media posts into modern Israeli Hebrew suitable for civil-defense analysis. Preserve URLs, @handles, and hashtags. Return ONLY valid JSON with the exact same structure as the input.`,
  ru: `You translate social-media posts into formal Russian suitable for civil-defense analysis. Preserve URLs, @handles, and hashtags. Return ONLY valid JSON with the exact same structure as the input.`,
};

function isTranslationEnabled() {
  return process.env.TRANSLATION_ENABLED === 'true';
}

function localeDir() {
  return reportsDirOverride ?? DEFAULT_LOCALE_DIR;
}

/** @param {string | null} dir */
export function setTranslationReportsDirForTests(dir) {
  reportsDirOverride = dir;
}

export function resetTranslationStateForTests() {
  memCache.clear();
  socialMemCache.clear();
  reportsDirOverride = null;
}

export function cacheKey(report, lang) {
  return `${report.date}_${report.report_scope?.id ?? 'national'}_${report.total_articles_analyzed ?? 0}_${lang}`;
}

function cacheFilePath(date, articlesCount, lang) {
  return resolve(localeDir(), `translation-v2-${date}-${articlesCount}-${lang}.json`);
}

function scopedCacheFilePath(report, lang) {
  const scope = report.report_scope?.id ?? 'national';
  if (scope === 'national') return cacheFilePath(report.date, report.total_articles_analyzed ?? 0, lang);
  return resolve(localeDir(), `translation-v2-${scope}-${report.date}-${report.total_articles_analyzed ?? 0}-${lang}.json`);
}

async function readDiskCache(report, lang) {
  try {
    const raw = await readFile(scopedCacheFilePath(report, lang), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeDiskCache(report, lang, translatedReport, coverage = null) {
  try {
    const withMeta = {
      ...translatedReport,
      _translation_meta: {
        schema: 'v7',
        model: SONNET_MODEL,
        coverage,
        fields: {
          cross_component_synthesis: true,
          components_narrative: true,
          components_evidence: true,
          components_interpretive: true,
          evidence: false,
          evidence_operator_structured: true,
          operator_investigation_pool: true,
          score_by_source_signals_evidence: false,
        },
        updatedAt: new Date().toISOString(),
      },
    };
    await writeFileAtomic(
      scopedCacheFilePath(report, lang),
      JSON.stringify(withMeta),
    );
  } catch {
    /* non-fatal */
  }
}

function socialPostsFingerprint(posts) {
  const payload = posts.map((p, i) => ({
    id: String(p.id ?? i),
    text: p.textOriginal ?? p.text ?? '',
    replies: (p.replies ?? []).map((r, j) => ({
      id: String(r.id ?? `${p.id ?? i}-r${j}`),
      text: r.textOriginal ?? r.text ?? r.quote_original ?? '',
    })),
  }));
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

/**
 * @param {object[]} posts
 * @param {string} lang
 * @param {{ date?: string, categoryId?: string, topicId?: string, bundleFingerprint?: string }} [opts]
 */
export function socialTranslationCacheKey(posts, lang, opts = {}) {
  const date = String(opts.date ?? '').trim();
  const categoryId = String(opts.categoryId ?? opts.topicId ?? '').trim();
  if (!date || !categoryId || !lang) return null;
  const fingerprint = opts.bundleFingerprint ?? socialPostsFingerprint(posts);
  return `${date}-${categoryId}-${fingerprint}-${lang}`;
}

function socialCacheFilePath(cacheKey) {
  return resolve(localeDir(), `social-translation-${cacheKey}.json`);
}

async function readSocialDiskCache(cacheKey) {
  if (!cacheKey) return null;
  if (socialMemCache.has(cacheKey)) return socialMemCache.get(cacheKey);
  try {
    const raw = await readFile(socialCacheFilePath(cacheKey), 'utf8');
    const parsed = JSON.parse(raw);
    socialMemCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function writeSocialDiskCache(cacheKey, posts) {
  if (!cacheKey) return;
  try {
    await writeFileAtomic(socialCacheFilePath(cacheKey), JSON.stringify(posts));
    socialMemCache.set(cacheKey, posts);
  } catch {
    /* non-fatal */
  }
}

/** Rows per strings-translation call — keeps each response well under max_tokens. */
const EVIDENCE_CHUNK_SIZE = 15;
const CONCURRENCY_COMPONENTS = 3;

const TARGET_SCRIPT_RE = { he: /[֐-׿]/g, ru: /[Ѐ-ӿ]/g };

/**
 * Heuristic: is this string written (mostly) in the target language's script?
 * Short / numeric / URL-only strings are exempt — nothing to judge.
 * @param {string} s
 * @param {'he' | 'ru'} lang
 */
export function isInTargetScript(s, lang) {
  const re = TARGET_SCRIPT_RE[lang];
  if (!re) return true;
  const str = String(s ?? '');
  const letters = str.match(/[A-Za-z֐-׿Ѐ-ӿ]/g) ?? [];
  if (letters.length < 15) return true;
  const target = str.match(re)?.length ?? 0;
  return target * 2 > letters.length;
}

function bulletStrip(raw) {
  return String(raw ?? '').replace(/^\s*-\s+/, '').slice(0, 2000);
}

/**
 * Unique translatable strings across every evidence surface of the report:
 * curated evidence, investigation pool (flat + by-source), and the short
 * per-component summary fields. Deduped by exact (bullet-stripped) text so
 * each string is translated once and fanned back out to all carriers.
 * @param {object[]} components
 * @returns {string[]}
 */
function collectReportStrings(components) {
  const seen = new Set();
  const out = [];
  const add = (raw) => {
    const text = bulletStrip(raw);
    if (text.trim() && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  };
  for (const c of components) {
    const { evidenceSource } = componentEvidenceSource(c);
    for (const e of evidenceSource) add(e.textOriginal ?? e.text ?? '');
    for (const e of c.operator_investigation_pool ?? []) add(e.textOriginal ?? e.evidence ?? '');
    for (const g of c.operator_investigation_pool_by_source ?? []) {
      for (const e of g.items ?? []) add(e.textOriginal ?? e.evidence ?? '');
    }
    add(c.interpretive_summary ?? '');
    add(c.data_quality_caveat ?? '');
  }
  return out;
}

/**
 * Translate a batch of strings in EVIDENCE_CHUNK_SIZE chunks.
 * Failed chunks leave their rows out of the returned map — the caller's
 * repair/coverage pass deals with them.
 * @param {string[]} texts
 * @param {{ lang: 'he'|'ru', queryHint: string, costDate?: string, usages: object[] }} ctx
 * @returns {Promise<Map<string, string>>} source text → translated text
 */
async function translateStringBatches(texts, ctx) {
  const out = new Map();
  const chunks = [];
  for (let i = 0; i < texts.length; i += EVIDENCE_CHUNK_SIZE) {
    chunks.push(texts.slice(i, i + EVIDENCE_CHUNK_SIZE));
  }
  const tasks = chunks.map((batch) => async () => {
    const srcLangs = new Set(batch.map((t) => detectSourceLang(t)));
    const sourceLang = srcLangs.size === 1 ? [...srcLangs][0] : 'mixed';
    try {
      const { result, usage } = await translateGenericJsonWithRetry(
        { strings: batch.map((text, j) => ({ id: String(j), text })) },
        ctx.lang,
        {
          useReportPrompt: true,
          sourceLang,
          queryHint: ctx.queryHint,
          costLabel: `translation-strings-${ctx.lang}`,
          costDate: ctx.costDate,
        },
      );
      ctx.usages.push(usage);
      const byId = new Map((result.strings ?? []).map((r) => [String(r.id), r.text]));
      batch.forEach((text, j) => {
        const tr = byId.get(String(j));
        if (typeof tr === 'string' && tr.trim()) out.set(text, tr);
      });
    } catch (err) {
      console.warn(`[translation] strings chunk failed (${ctx.lang}): ${err?.message ?? err}`);
    }
  });
  await runWithConcurrencyLimit(tasks, CONCURRENCY_COMPONENTS);
  return out;
}

/**
 * First pass + one targeted repair pass over rows that came back missing or
 * still in the wrong script. Rows that fail both passes keep their source
 * text and are counted in coverage.failed instead of silently shipping.
 * @param {string[]} allStrings
 * @param {{ lang: 'he'|'ru', coverage: object }} ctx
 * @returns {Promise<Map<string, string>>}
 */
async function translateReportStrings(allStrings, ctx) {
  const map = new Map();
  const rows = [];
  for (const text of allStrings) {
    ctx.coverage.total += 1;
    if (shouldSkipTranslation(detectSourceLang(text), ctx.lang)) {
      ctx.coverage.translated += 1;
      map.set(text, text);
    } else {
      rows.push(text);
    }
  }
  if (!rows.length) return map;

  const firstPass = await translateStringBatches(rows, ctx);
  for (const [k, v] of firstPass) map.set(k, v);

  const failedRows = rows.filter((t) => {
    const tr = map.get(t);
    return tr == null || !isInTargetScript(tr, ctx.lang);
  });
  ctx.coverage.translated += rows.length - failedRows.length;
  if (!failedRows.length) return map;

  const repairPass = await translateStringBatches(failedRows, ctx);
  let repaired = 0;
  for (const t of failedRows) {
    const tr = repairPass.get(t);
    if (tr != null && isInTargetScript(tr, ctx.lang)) {
      map.set(t, tr);
      repaired += 1;
    } else if (!map.has(t)) {
      map.set(t, t);
    }
  }
  ctx.coverage.repaired += repaired;
  ctx.coverage.failed += failedRows.length - repaired;
  return map;
}

/**
 * Translate one long prose field (synthesis / component narrative) as plain
 * text. One in-place repair attempt when the output isn't in the target
 * script; keeps the source text (and counts a failure) otherwise.
 * @param {string | null | undefined} source
 * @param {{ lang: 'he'|'ru', coverage: object, usages: object[] }} ctx
 */
async function translateProseField(source, ctx) {
  const text = String(source ?? '').trim();
  if (!text) return source;
  ctx.coverage.total += 1;
  const srcLang = detectSourceLang(text);
  if (shouldSkipTranslation(srcLang, ctx.lang)) {
    ctx.coverage.translated += 1;
    return text;
  }
  const opts = {
    queryHint: ctx.queryHint,
    costLabel: `translation-prose-${ctx.lang}`,
    costDate: ctx.costDate,
    sourceLang: srcLang,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { result, usage } = await translateProseWithRetry(text, ctx.lang, opts);
      ctx.usages.push(usage);
      if (isInTargetScript(result, ctx.lang)) {
        ctx.coverage[attempt === 0 ? 'translated' : 'repaired'] += 1;
        return result;
      }
    } catch (err) {
      console.warn(`[translation] prose field failed (${ctx.lang}, attempt ${attempt + 1}): ${err?.message ?? err}`);
    }
  }
  ctx.coverage.failed += 1;
  return text;
}

/** @param {object[] | undefined} items @param {(raw: string) => string | null} lookup */
function translatePoolItems(items, lookup) {
  return (items ?? []).map((e) => {
    const original = String(e.textOriginal ?? e.evidence ?? '');
    return { ...e, textOriginal: original, text: lookup(original) ?? original };
  });
}

async function translateSocialChunk(payload, lang, langName) {
  const system = SOCIAL_POST_SYSTEM_PROMPT[lang];
  if (!system) throw new Error(`Unsupported social translation language: ${lang}`);

  const message = await getDefaultLlmPort().createMessage({
    model: SONNET_MODEL,
    max_tokens: 8000,
    callContext: { feature: 'translation', purpose: 'translation-social' },
    system,
    messages: [{
      role: 'user',
      content: `Translate the following JSON into ${langName}. Return ONLY valid JSON with the exact same structure.\n\n${JSON.stringify(payload)}`,
    }],
  });

  if (message.stop_reason === 'max_tokens') {
    throw new Error('Social post translation chunk truncated (max_tokens)');
  }

  const raw = message.content[0].text;
  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) throw new Error('Social translation response contained no JSON');

  let result;
  try {
    result = JSON.parse(match[0]);
  } catch {
    result = JSON.parse(jsonrepair(match[0]));
  }

  return { result, usage: message.usage };
}

async function translateSocialChunkWithRetry(payload, lang, langName) {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await translateSocialChunk(payload, lang, langName);
    } catch (err) {
      const transient = isTransientTranslateError(err);
      if (!transient || attempt === MAX_ATTEMPTS) throw err;
      const base = 750 * (2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 250);
      await sleep(base + jitter);
    }
  }
  throw new Error('Social translation provider error (exhausted retries)');
}

function socialPostSourceText(post) {
  return post.textOriginal ?? post.text ?? '';
}

function socialReplySourceText(reply) {
  return reply.textOriginal ?? reply.text ?? reply.quote_original ?? '';
}

function mergeSocialTranslation(posts, result, lang) {
  const byId = new Map((result.posts ?? []).map((row) => [String(row.id), row]));

  return posts.map((p, i) => {
    const tr = byId.get(String(p.id ?? i)) ?? {};
    const sourceText = socialPostSourceText(p);
    const sourceBehavior = p.behaviorOrEmotionOriginal ?? p.behaviorOrEmotion ?? '';
    const replyById = new Map((tr.replies ?? []).map((row) => [String(row.id), row]));
    return {
      ...p,
      textOriginal: p.textOriginal ?? sourceText,
      text: tr.text ?? sourceText,
      behaviorOrEmotionOriginal: p.behaviorOrEmotionOriginal ?? sourceBehavior,
      behaviorOrEmotion: tr.behaviorOrEmotion ?? sourceBehavior,
      location: tr.location || p.location,
      replies: (p.replies ?? []).map((r, j) => {
        const rid = String(r.id ?? `${p.id ?? i}-r${j}`);
        const trReply = replyById.get(rid) ?? {};
        const sourceReply = socialReplySourceText(r);
        return {
          ...r,
          textOriginal: r.textOriginal ?? sourceReply,
          text: trReply.text ?? sourceReply,
        };
      }),
      translatedTo: lang,
    };
  });
}

/**
 * @param {object} c
 * @returns {{ useEvidenceField: boolean, evidenceSource: object[] }}
 */
function componentEvidenceSource(c) {
  if (c.evidence_operator_structured?.length) {
    return {
      useEvidenceField: false,
      evidenceSource: c.evidence_operator_structured,
    };
  }
  const useEvidenceField = Array.isArray(c.evidence)
    && c.evidence.some((e) => e?.markdown);
  return {
    useEvidenceField,
    evidenceSource: useEvidenceField ? c.evidence : [],
  };
}

/**
 * Routing rationale suffix carried on structured evidence items (stamped by
 * resilience_scorer's operator surface). Markdown is rebuilt from text+url
 * after translation, so the label must be re-appended or it is lost.
 * @param {{ signal_type?: string|null, routing_role?: string|null }} e
 * @returns {string}
 */
function routingLabelSuffix(e) {
  if (!e?.signal_type) return '';
  const role = e.routing_role ?? 'primary';
  return ` \`${e.signal_type} · ${role}\``;
}

/**
 * @param {object} c
 * @param {boolean} useEvidenceField
 * @param {object[]} translatedStructured
 * @returns {object}
 */
function translatedEvidenceFields(c, useEvidenceField, translatedStructured) {
  if (c.evidence_operator_structured?.length) {
    return { evidence_operator_structured: translatedStructured };
  }
  if (useEvidenceField && translatedStructured.length) {
    return { evidence: translatedStructured };
  }
  return {};
}

/**
 * Return a usable disk-cache hit, or null when the entry is stale / incomplete.
 * @param {object} fromDisk
 * @param {object} report
 * @param {string} lang
 * @returns {object|null}
 */
function cleanDiskCacheHit(fromDisk, report, lang) {
  const meta = fromDisk?._translation_meta;
  const isCurrentSchema = meta?.schema === 'v7'
    && meta?.fields?.components_evidence === true;
  const metaSaysSynthesisTranslated = meta?.fields?.cross_component_synthesis === true;
  const synthesisHead = String(fromDisk?.cross_component_synthesis ?? '').trim();
  const looksLikeEnglish = synthesisHead.length > 0 && (synthesisHead.codePointAt(0) ?? 0) <= 0x7f;
  const needsSynthesisUpgrade = !metaSaysSynthesisTranslated && looksLikeEnglish && (lang === 'he' || lang === 'ru');
  const needsStructuredEvidenceUpgrade = !meta?.fields?.evidence_operator_structured
    && (report.components ?? []).some((c) => c.evidence_operator_structured?.length > 0);

  if (!isCurrentSchema || needsSynthesisUpgrade || needsStructuredEvidenceUpgrade) {
    return null;
  }
  const clean = { ...fromDisk };
  delete clean._translation_meta;
  return clean;
}

/**
 * Translate the narrative fields of a report into the target language.
 *
 * @param {object} report – assessment object (report.components, report.cross_component_synthesis, …)
 * @param {string} lang   – 'he' | 'ru'  (never 'en')
 * @returns {Promise<object>} report with translated text fields merged in
 */
export async function getTranslatedReport(report, lang) {
  if (!report || lang === 'en' || !isTranslationEnabled()) return report;

  const key = cacheKey(report, lang);
  if (memCache.has(key)) {
    return memCache.get(key);
  }

  const fromDisk = await readDiskCache(report, lang);
  if (fromDisk) {
    const clean = cleanDiskCacheHit(fromDisk, report, lang);
    if (clean) {
      memCache.set(key, clean);
      return clean;
    }
  }

  const components = report.components ?? [];
  const synthesisSource = report.cross_component_synthesis_operator ?? report.cross_component_synthesis ?? '';
  const ctx = {
    lang,
    queryHint: String(synthesisSource).slice(0, 600),
    costDate: report.date,
    usages: [],
    coverage: { total: 0, translated: 0, repaired: 0, failed: 0 },
  };

  const translatedSynthesis = await translateProseField(synthesisSource, ctx);
  const translatedNarratives = await runWithConcurrencyLimit(
    components.map((c) => () => translateProseField(c.narrative_operator ?? c.narrative, ctx)),
    CONCURRENCY_COMPONENTS,
  );
  const stringMap = await translateReportStrings(collectReportStrings(components), ctx);
  const lookup = (raw) => stringMap.get(bulletStrip(raw)) ?? null;

  const totalUsage = ctx.usages.reduce(
    (acc, usage) => ({
      input_tokens: acc.input_tokens + (usage.input_tokens ?? 0),
      output_tokens: acc.output_tokens + (usage.output_tokens ?? 0),
    }),
    { input_tokens: 0, output_tokens: 0 },
  );
  const cliMeta = transportMeta(getDefaultLlmPort());
  const costUsd = cliMeta.transport ? 0 : calcInvocationCostUsd(SONNET_MODEL, totalUsage);
  appendCostLog({
    script: `translation-${lang}`,
    date: report.date,
    totalCostUsd: costUsd,
    usageLog: [{ label: `translate-${lang}`, model: SONNET_MODEL, usage: totalUsage, cost: costUsd, ...cliMeta }],
  });

  const translatedReport = {
    ...report,
    cross_component_synthesis: translatedSynthesis ?? synthesisSource,
    ...(report.cross_component_synthesis_operator == null
      ? {}
      : { cross_component_synthesis_operator: translatedSynthesis ?? report.cross_component_synthesis_operator }),
    components: components.map((c, i) => mergeTranslatedComponent(c, lookup, translatedNarratives[i])),
  };

  const cov = ctx.coverage;
  console.error(`[translation] ${report.date} ${lang} coverage: total=${cov.total} translated=${cov.translated} repaired=${cov.repaired} failed=${cov.failed}`);
  // A mostly-failed result (e.g. transport outage) must not become a durable
  // cache serving English forever — skip caching so the next request retries.
  const tooManyFailures = cov.failed * 4 > cov.total;
  if (tooManyFailures) {
    console.warn(`[translation] ${report.date} ${lang}: ${cov.failed}/${cov.total} units failed — result NOT cached`);
    return translatedReport;
  }
  if (cov.failed > 0) {
    console.warn(`[translation] ${report.date} ${lang}: ${cov.failed}/${cov.total} units kept source text (see _translation_meta.coverage)`);
  }
  memCache.set(key, translatedReport);
  await writeDiskCache(report, lang, translatedReport, cov);
  return translatedReport;
}

/**
 * @param {object} c
 * @param {(raw: string) => string | null} lookup
 * @param {string | null | undefined} translatedNarrative
 */
function mergeTranslatedComponent(c, lookup, translatedNarrative) {
  const { useEvidenceField, evidenceSource } = componentEvidenceSource(c);
  const translatedStructured = evidenceSource.map((e) => {
    const originalText = e.textOriginal ?? e.text ?? '';
    const translatedText = lookup(originalText) ?? bulletStrip(originalText);
    const url = e.url ?? null;
    const base = url ? `- ${translatedText} [source](${url})` : `- ${translatedText}`;
    return { ...e, textOriginal: originalText, text: translatedText, markdown: `${base}${routingLabelSuffix(e)}` };
  });
  return {
    ...c,
    ...(c.narrative_operator == null
      ? { narrative: translatedNarrative }
      : { narrative: c.narrative, narrative_operator: translatedNarrative }),
    interpretive_summary: lookup(c.interpretive_summary) ?? c.interpretive_summary,
    data_quality_caveat: lookup(c.data_quality_caveat) ?? c.data_quality_caveat,
    ...translatedEvidenceFields(c, useEvidenceField, translatedStructured),
    ...(c.operator_investigation_pool
      ? { operator_investigation_pool: translatePoolItems(c.operator_investigation_pool, lookup) }
      : {}),
    ...(c.operator_investigation_pool_by_source
      ? {
        operator_investigation_pool_by_source: c.operator_investigation_pool_by_source.map(
          (g) => ({ ...g, items: translatePoolItems(g.items, lookup) }),
        ),
      }
      : {}),
  };
}

/**
 * Translate social-media post evidence to the UI language.
 *
 * @param {object[]} posts
 * @param {string} lang 'he' | 'ru' | 'en'
 * @param {{ date?: string, categoryId?: string, topicId?: string, bundleFingerprint?: string }} [opts]
 * @returns {Promise<object[]>}
 */
export async function translateSocialPosts(posts, lang, opts = {}) {
  if (!Array.isArray(posts) || !posts.length || !lang) return posts;
  if (!SOCIAL_POST_SYSTEM_PROMPT[lang]) return posts;
  if (posts.every((p) => p.translatedTo === lang)) return posts;
  if (!isTranslationEnabled()) return posts;

  const diskKey = socialTranslationCacheKey(posts, lang, opts);
  const cached = await readSocialDiskCache(diskKey);
  if (cached) return cached;

  const langName = LANG_NAMES[lang] ?? lang;
  const payload = {
    posts: posts.map((p, i) => ({
      id: String(p.id ?? i),
      text: socialPostSourceText(p),
      behaviorOrEmotion: p.behaviorOrEmotionOriginal ?? p.behaviorOrEmotion ?? '',
      location: p.location && p.location !== 'לא ברור' ? p.location : '',
      replies: (p.replies ?? []).map((r, j) => ({
        id: String(r.id ?? `${p.id ?? i}-r${j}`),
        text: socialReplySourceText(r),
      })),
    })),
  };

  let result;
  try {
    ({ result } = await translateSocialChunkWithRetry(payload, lang, langName));
  } catch {
    return posts;
  }

  const translated = mergeSocialTranslation(posts, result, lang);
  await writeSocialDiskCache(diskKey, translated);
  return translated;
}
