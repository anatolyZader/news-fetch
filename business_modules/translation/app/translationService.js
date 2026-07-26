import { createHash } from 'node:crypto';
import { getDefaultLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { transportMeta } from '../../../cross-cut-modules/llm/resolveLlmPort.js';
import { SONNET_MODEL } from '../../../cross-cut-modules/llm/modelIds.js';
import { jsonrepair } from 'jsonrepair';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcInvocationCostUsd } from '../../../cross-cut-modules/budget/index.js';
import { appendCostLog } from '../../../cross-cut-modules/log/index.js';
import {
  getErrStatus,
  isTransientTranslateError,
  runWithConcurrencyLimit,
  sleep,
} from './translationTranslateUtils.js';
import { translateGenericJsonWithRetry, LANG_NAMES } from './translateGenericJson.js';
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

async function writeDiskCache(report, lang, translatedReport) {
  try {
    const withMeta = {
      ...translatedReport,
      _translation_meta: {
        schema: 'v6',
        model: SONNET_MODEL,
        fields: {
          cross_component_synthesis: true,
          components_narrative: true,
          components_evidence: true,
          components_interpretive: true,
          evidence: false,
          evidence_operator_structured: true,
          score_by_source_signals_evidence: false,
        },
        updatedAt: new Date().toISOString(),
      },
    };
    await writeFile(
      scopedCacheFilePath(report, lang),
      JSON.stringify(withMeta),
      'utf8',
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
    await writeFile(socialCacheFilePath(cacheKey), JSON.stringify(posts), 'utf8');
    socialMemCache.set(cacheKey, posts);
  } catch {
    /* non-fatal */
  }
}

/**
 * Send one small JSON payload to Claude and return the parsed result + usage.
 */
async function translateChunk(payload, lang, langName, queryHint = '') {
  const { result, usage } = await translateGenericJsonWithRetry(payload, lang, {
    useReportPrompt: true,
    queryHint: queryHint || JSON.stringify(payload).slice(0, 500),
    costLabel: `translation-chunk-${lang}`,
    costDate: queryHint?.slice?.(0, 10),
  });
  return { result, usage };
}

async function translateChunkWithRetry(payload, lang, langName, queryHint = '') {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await translateChunk(payload, lang, langName, queryHint);
    } catch (err) {
      const status = getErrStatus(err);
      const transient = isTransientTranslateError(err);
      if (!transient || attempt === MAX_ATTEMPTS) {
        const detail = status ? `HTTP ${status}` : (err?.message ?? 'unknown error');
        throw new Error(`Translation provider error (${detail})`, { cause: err });
      }
      const base = 750 * (2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 250);
      await sleep(base + jitter);
    }
  }
  throw new Error('Translation provider error (exhausted retries)');
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
    const meta = fromDisk?._translation_meta;
    const isCurrentSchema = meta?.schema === 'v6'
      && meta?.fields?.components_evidence === true;
    const metaSaysSynthesisTranslated = meta?.fields?.cross_component_synthesis === true;
    const synthesisHead = String(fromDisk?.cross_component_synthesis ?? '').trim();
    const looksLikeEnglish = synthesisHead.length > 0 && (synthesisHead.codePointAt(0) ?? 0) <= 0x7f;
    const needsSynthesisUpgrade = !metaSaysSynthesisTranslated && looksLikeEnglish && (lang === 'he' || lang === 'ru');
    const needsStructuredEvidenceUpgrade = !meta?.fields?.evidence_operator_structured
      && (report.components ?? []).some((c) => c.evidence_operator_structured?.length > 0);

    if (!isCurrentSchema || needsSynthesisUpgrade || needsStructuredEvidenceUpgrade) {
      // Fall through to full re-translate when cache is stale or missing fields.
      if (isCurrentSchema && !needsSynthesisUpgrade && !needsStructuredEvidenceUpgrade) {
        const clean = { ...fromDisk };
        delete clean._translation_meta;
        memCache.set(key, clean);
        return clean;
      }
    } else {
      const clean = { ...fromDisk };
      delete clean._translation_meta;
      memCache.set(key, clean);
      return clean;
    }
  }

  const langName = LANG_NAMES[lang] ?? lang;
  const components = report.components ?? [];
  const synthesisSource = report.cross_component_synthesis_operator ?? report.cross_component_synthesis ?? '';
  const translationQueryHint = String(synthesisSource).slice(0, 600);
  const CONCURRENCY_COMPONENTS = 3;

  const synthesisChunk = await translateChunkWithRetry({
    cross_component_synthesis: synthesisSource,
  }, lang, langName, translationQueryHint);

  const componentChunks = await runWithConcurrencyLimit(
    components.map((c) => () => {
      const narrativeSource = c.narrative_operator ?? c.narrative ?? '';
      const { evidenceSource } = componentEvidenceSource(c);
      const structuredItems = evidenceSource.map((e, j) => ({
        id: String(j),
        text: String(e.textOriginal ?? e.text ?? '').replace(/^\s*-\s+/, '').slice(0, 2000),
      })).filter((row) => row.text.trim());
      return translateChunkWithRetry({
        narrative: narrativeSource,
        interpretive_summary: c.interpretive_summary ?? '',
        data_quality_caveat: c.data_quality_caveat ?? '',
        ...(structuredItems.length ? { evidence_structured: structuredItems } : {}),
      }, lang, langName, `${translationQueryHint} ${c.component_id ?? ''} ${narrativeSource}`.slice(0, 600));
    }),
    CONCURRENCY_COMPONENTS,
  );

  const allChunks = [synthesisChunk, ...componentChunks];
  const totalUsage = allChunks.reduce(
    (acc, { usage }) => ({
      input_tokens: acc.input_tokens + (usage.input_tokens ?? 0),
      output_tokens: acc.output_tokens + (usage.output_tokens ?? 0),
    }),
    { input_tokens: 0, output_tokens: 0 },
  );

  const translationModel = SONNET_MODEL;
  const cliMeta = transportMeta(getDefaultLlmPort());
  const costUsd = cliMeta.transport ? 0 : calcInvocationCostUsd(translationModel, totalUsage);
  appendCostLog({
    script: `translation-${lang}`,
    date: report.date,
    totalCostUsd: costUsd,
    usageLog: [{ label: `translate-${lang}`, model: translationModel, usage: totalUsage, cost: costUsd, ...cliMeta }],
  });

  const translatedReport = {
    ...report,
    cross_component_synthesis: synthesisChunk.result.cross_component_synthesis ?? synthesisSource,
    ...(report.cross_component_synthesis_operator == null
      ? {}
      : {
        cross_component_synthesis_operator:
          synthesisChunk.result.cross_component_synthesis ?? report.cross_component_synthesis_operator,
      }),
    components: components.map((c, i) => {
      const chunk = componentChunks[i].result;
      const narrativeSource = c.narrative_operator ?? c.narrative;
      const { useEvidenceField, evidenceSource } = componentEvidenceSource(c);
      const translatedStructured = evidenceSource.map((e, j) => {
        const row = (chunk.evidence_structured ?? []).find((r) => String(r.id) === String(j)) ?? chunk.evidence_structured?.[j];
        const originalText = e.textOriginal ?? e.text ?? '';
        const translatedText = row?.text || originalText;
        const url = e.url ?? null;
        const base = url ? `- ${translatedText} [source](${url})` : `- ${translatedText}`;
        const markdown = `${base}${routingLabelSuffix(e)}`;
        return { ...e, textOriginal: originalText, text: translatedText, markdown };
      });
      const translatedNarrative = chunk.narrative ?? narrativeSource;
      return {
        ...c,
        ...(c.narrative_operator == null
          ? { narrative: translatedNarrative }
          : {
            narrative: c.narrative,
            narrative_operator: translatedNarrative,
          }),
        interpretive_summary: chunk.interpretive_summary ?? c.interpretive_summary,
        data_quality_caveat: chunk.data_quality_caveat ?? c.data_quality_caveat,
        ...translatedEvidenceFields(c, useEvidenceField, translatedStructured),
      };
    }),
  };

  memCache.set(key, translatedReport);
  await writeDiskCache(report, lang, translatedReport);
  return translatedReport;
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
