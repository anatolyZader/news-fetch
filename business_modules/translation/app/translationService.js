import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcInvocationCostUsd } from '../../../cross-cut-modules/budget/index.js';
import { appendCostLog } from '../../../cross-cut-modules/log/index.js';
import { translationTermRagEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';
import { buildTranslationTermBlock } from '../../../cross-cut-modules/retrieval/translationTermRetrieval.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = resolve(__dirname, '../../../reports');

const client = new Anthropic();

/** In-memory cache to avoid disk reads on repeat requests */
const memCache = new Map();

let translationRetrievalSvc = null;

function getTranslationRetrieval() {
  if (!translationTermRagEnabled()) return null;
  if (!translationRetrievalSvc) {
    const sqlitePath = process.env.SQLITE_PATH?.trim()
      ? resolve(process.env.SQLITE_PATH.trim())
      : resolve(__dirname, '../../../db/app.sqlite');
    translationRetrievalSvc = createRetrievalService({ dbPath: sqlitePath });
  }
  return translationRetrievalSvc;
}

async function translationSystemPrompt(lang, queryHint) {
  let system = SYSTEM_PROMPT[lang];
  const svc = getTranslationRetrieval();
  if (!svc) return system;
  const hint = String(queryHint ?? '').trim().slice(0, 600);
  if (!hint) return system;
  try {
    const block = await buildTranslationTermBlock(lang, hint, { retrieval: svc.retrieval });
    if (block) system += block;
  } catch {
    // non-fatal
  }
  return system;
}

const LANG_NAMES = { en: 'English', he: 'Hebrew', ru: 'Russian' };

const SOCIAL_POST_SYSTEM_PROMPT = {
  en: `You translate citizen social-media posts about the Israeli home front and civil defense into clear, natural English. Preserve URLs, @handles, and hashtags. Return ONLY valid JSON with the exact same structure as the input.`,
  he: `You translate social-media posts into modern Israeli Hebrew suitable for civil-defense analysis. Preserve URLs, @handles, and hashtags. Return ONLY valid JSON with the exact same structure as the input.`,
  ru: `You translate social-media posts into formal Russian suitable for civil-defense analysis. Preserve URLs, @handles, and hashtags. Return ONLY valid JSON with the exact same structure as the input.`,
};

function isSocialTranslationEnabled() {
  return process.env.TRANSLATION_ENABLED === 'true' || Boolean(process.env.ANTHROPIC_API_KEY);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrStatus(err) {
  return err?.status ?? err?.statusCode ?? err?.response?.status ?? err?.cause?.status;
}

function isTransientTranslateError(err) {
  const status = getErrStatus(err);
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 524) return true;
  const msg = String(err?.message ?? '');
  return (
    /\b524\b/.test(msg) ||
    /\b502\b/.test(msg) ||
    /\b503\b/.test(msg) ||
    /\b504\b/.test(msg) ||
    /\btimeout\b/i.test(msg) ||
    /\betimedout\b/i.test(msg) ||
    /\beconnreset\b/i.test(msg)
  );
}

async function runWithConcurrencyLimit(taskFns, limit) {
  const n = taskFns.length;
  if (n === 0) return [];
  const results = new Array(n);
  let nextIdx = 0;

  const workers = new Array(Math.min(limit, n)).fill(0).map(async () => {
    while (true) {
      const idx = nextIdx;
      nextIdx += 1;
      if (idx >= n) break;
      results[idx] = await taskFns[idx]();
    }
  });

  await Promise.all(workers);
  return results;
}

const GLOSSARY = {
  he: `
Component name glossary (use these exact translations — do not paraphrase):
- Narrative → נרטיב
- Information, Communication, and Sharing → מידע, תקשורת ושיתוף
- Effective Life-Saving Behavior → התנהגות אפקטיבית להצלת חיים
- Functional Continuity → רציפות תפקודית
- Community Capital and Resources → הון ומשאבי קהילה
- Leadership → מנהיגות
- Belonging and Solidarity → שייכות וסולידריות
- Physical and Mental Wellbeing (At-Risk Populations) → דאגה לרווחה הפיזית והנפשית בדגש על אוכלוסיות סיכון

Key term glossary:
- Home Front Command / HFC → פיקוד העורף
- resilience → חוסן
- community resilience → חוסן קהילתי
- coping → התמודדות
- protective guidelines → הנחיות מגן
- at-risk populations → אוכלוסיות סיכון
- mutual aid → עזרה הדדית
- collective efficacy → אפקטיביות קולקטיבית
- shelter → ממ"ד / מרחב מוגן
- evacuation → פינוי
- displaced residents → תושבים מפונים
- local authority → רשות מקומית
`,
  ru: `
Глоссарий названий компонентов (используйте эти точные переводы — без перефразировок):
- Narrative → Нарратив
- Information, Communication, and Sharing → Информация, коммуникация и обмен
- Effective Life-Saving Behavior → Эффективное жизнеспасающее поведение
- Functional Continuity → Функциональная непрерывность
- Community Capital and Resources → Общественный капитал и ресурсы
- Leadership → Лидерство
- Belonging and Solidarity → Принадлежность и солидарность
- Physical and Mental Wellbeing (At-Risk Populations) → Физическое и психическое благополучие (уязвимые группы)

Глоссарий ключевых терминов:
- Home Front Command / HFC → Командование тыла
- resilience → устойчивость / жизнестойкость
- community resilience → устойчивость общины
- coping → совладание / преодоление
- protective guidelines → защитные инструкции
- at-risk populations → уязвимые группы населения
- mutual aid → взаимопомощь
- collective efficacy → коллективная эффективность
- shelter → защитное укрытие / бомбоубежище
- evacuation → эвакуация
- displaced residents → эвакуированные жители
- local authority → местная власть / муниципалитет
`,
};

const SYSTEM_PROMPT = {
  he: `You are a professional translator specializing in Israeli civil defense and emergency management. You are translating a Home Front Command (פיקוד העורף) community resilience assessment report from English into modern Israeli Hebrew.

Style requirements:
- Use formal, analytical modern Israeli Hebrew (not biblical or archaic forms)
- Use established Israeli military/civilian defense terminology
- Maintain the analytical, evidence-based register of the original
- Gender: default to masculine plural for general population references unless context specifies otherwise
- Preserve all proper nouns (place names, organization names) as they appear

${GLOSSARY.he}
Return ONLY valid JSON with the exact same structure as the input. Do NOT translate field names or component_id values. Do NOT translate or alter URLs. Do NOT translate markdown link text — keep ([source](url)) patterns exactly as ([source](url)).`,

  ru: `You are a professional translator specializing in civil defense and emergency management. You are translating an Israeli Home Front Command community resilience assessment report from English into formal Russian.

Style requirements:
- Use formal, analytical Russian appropriate for official government/defense reporting
- Maintain the evidence-based, analytical register of the original
- Use established Russian civil defense and emergency management terminology
- Transliterate Israeli place names phonetically where no established Russian form exists

${GLOSSARY.ru}
Return ONLY valid JSON with the exact same structure as the input. Do NOT translate field names or component_id values. Do NOT translate or alter URLs. Do NOT translate markdown link text — keep ([source](url)) patterns exactly as ([source](url)).`,
};

function cacheKey(report, lang) {
  return `${report.date}_${report.report_scope?.id ?? 'national'}_${report.total_articles_analyzed ?? 0}_${lang}`;
}

function cacheFilePath(date, articlesCount, lang) {
  // Keep legacy v2 filename so existing caches are reused.
  return resolve(REPORTS_DIR, `translation-v2-${date}-${articlesCount}-${lang}.json`);
}

function scopedCacheFilePath(report, lang) {
  const scope = report.report_scope?.id ?? 'national';
  if (scope === 'national') return cacheFilePath(report.date, report.total_articles_analyzed ?? 0, lang);
  return resolve(REPORTS_DIR, `translation-v2-${scope}-${report.date}-${report.total_articles_analyzed ?? 0}-${lang}.json`);
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
        schema: 'v2',
        model: 'claude-sonnet-4-6',
        fields: {
          cross_component_synthesis: true,
          components_narrative: true,
          evidence: false,
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

/**
 * Send one small JSON payload to Claude and return the parsed result + usage.
 */
async function translateChunk(payload, lang, langName, queryHint = '') {
  const system = await translationSystemPrompt(lang, queryHint || JSON.stringify(payload).slice(0, 500));
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system,
    messages: [{
      role: 'user',
      content: `Translate the following JSON into ${langName}. Return ONLY valid JSON with the exact same structure.\n\n${JSON.stringify(payload)}`,
    }],
  });

  if (message.stop_reason === 'max_tokens') {
    throw new Error(`Translation chunk truncated (max_tokens). Payload keys: ${Object.keys(payload).join(', ')}`);
  }

  const raw = message.content[0].text;
  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) throw new Error('Translation response contained no JSON');

  let result;
  try {
    result = JSON.parse(match[0]);
  } catch {
    result = JSON.parse(jsonrepair(match[0]));
  }

  return { result, usage: message.usage };
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
      // Exponential backoff with small jitter to avoid stampeding.
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

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
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

/**
 * Translate the narrative and evidence fields of a report into the target language.
 * All components are translated in parallel (one API call each) plus one call for
 * the executive synthesis and caveats.
 *
 * Results are cached to disk so subsequent requests (and server restarts) are free.
 * Cache key includes total_articles_analyzed so a new analysis run invalidates it.
 *
 * @param {object} report – assessment object (report.components, report.cross_component_synthesis, …)
 * @param {string} lang   – 'he' | 'ru'  (never 'en')
 * @returns {object} report with translated text fields merged in
 */
export async function getTranslatedReport(report, lang) {
  if (!report || lang === 'en') return report;

  const key = cacheKey(report, lang);
  if (memCache.has(key)) {
    return memCache.get(key);
  }

  const fromDisk = await readDiskCache(report, lang);
  if (fromDisk) {
    // If this is an older cached translation that lacks executive summary translation,
    // upgrade it by translating ONLY the missing summary and writing back.
    const meta = fromDisk?._translation_meta;
    const metaSaysSynthesisTranslated = meta?.fields?.cross_component_synthesis === true;
    const synthesisHead = String(fromDisk?.cross_component_synthesis ?? '').trim();
    const looksLikeEnglish = synthesisHead.length > 0 && (synthesisHead.codePointAt(0) ?? 0) <= 0x7f;
    const needsSynthesisUpgrade = !metaSaysSynthesisTranslated && looksLikeEnglish && (lang === 'he' || lang === 'ru');

    if (needsSynthesisUpgrade) {
      const langName = LANG_NAMES[lang] ?? lang;
      const upgradedSynthesis = await translateChunkWithRetry({
        cross_component_synthesis: report.cross_component_synthesis ?? fromDisk.cross_component_synthesis ?? '',
      }, lang, langName);
      const upgraded = {
        ...fromDisk,
        cross_component_synthesis: upgradedSynthesis.result.cross_component_synthesis ?? fromDisk.cross_component_synthesis,
      };
      memCache.set(key, upgraded);
      await writeDiskCache(report, lang, upgraded);
      return upgraded;
    }

    memCache.set(key, fromDisk);
    return fromDisk;
  }

  const langName = LANG_NAMES[lang] ?? lang;
  const components = report.components ?? [];
  const translationQueryHint = String(report.cross_component_synthesis ?? '').slice(0, 600);

  // Many parallel translation calls can trigger upstream gateway timeouts.
  // Keep concurrency modest and retry transient failures (524/5xx/429).
  const CONCURRENCY_COMPONENTS = 3;

  // Translate the executive summary (general resume) as well.
  const synthesisChunk = await translateChunkWithRetry({
    cross_component_synthesis: report.cross_component_synthesis ?? '',
  }, lang, langName, translationQueryHint);

  const componentChunks = await runWithConcurrencyLimit(
    components.map((c) => () => translateChunkWithRetry({
      narrative: c.narrative ?? '',
    }, lang, langName, `${translationQueryHint} ${c.component_id ?? ''} ${c.narrative ?? ''}`.slice(0, 600))),
    CONCURRENCY_COMPONENTS,
  );

  // Aggregate token usage across all parallel calls for cost tracking.
  const allChunks = [synthesisChunk, ...componentChunks];
  const totalUsage = allChunks.reduce(
    (acc, { usage }) => ({
      input_tokens:  acc.input_tokens  + (usage.input_tokens  ?? 0),
      output_tokens: acc.output_tokens + (usage.output_tokens ?? 0),
    }),
    { input_tokens: 0, output_tokens: 0 },
  );

  const translationModel = 'claude-sonnet-4-6';
  const costUsd = calcInvocationCostUsd(translationModel, totalUsage);
  appendCostLog({
    script: `translation-${lang}`,
    date: report.date,
    totalCostUsd: costUsd,
    usageLog: [{ label: `translate-${lang}`, model: translationModel, usage: totalUsage, cost: costUsd }],
  });

  const translatedReport = {
    ...report,
    cross_component_synthesis: synthesisChunk.result.cross_component_synthesis ?? report.cross_component_synthesis,
    components: components.map((c, i) => ({
      ...c,
      narrative: componentChunks[i].result.narrative ?? c.narrative,
    })),
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
 * @returns {Promise<object[]>}
 */
export async function translateSocialPosts(posts, lang) {
  if (!Array.isArray(posts) || !posts.length || !lang) return posts;
  if (!SOCIAL_POST_SYSTEM_PROMPT[lang]) return posts;
  if (posts.every((p) => p.translatedTo === lang)) return posts;
  if (!isSocialTranslationEnabled()) return posts;

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
