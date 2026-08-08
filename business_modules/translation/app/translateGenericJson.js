import { getDefaultLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { transportMeta } from '../../../cross-cut-modules/llm/resolveLlmPort.js';
import { SONNET_MODEL } from '../../../cross-cut-modules/llm/modelIds.js';
import { jsonrepair } from 'jsonrepair';
import { calcInvocationCostUsd } from '../../../cross-cut-modules/budget/index.js';
import { appendCostLog } from '../../../cross-cut-modules/log/index.js';
import {
  getErrStatus,
  isTransientTranslateError,
  retryJitterMs,
  sleep,
} from './translationTranslateUtils.js';
import { translationSystemPrompt } from './translationTermRag.js';
import { buildReportSystemPrompt, buildProseSystemPrompt } from './translationGlossary.js';

const LANG_NAMES = { en: 'English', he: 'Hebrew', ru: 'Russian' };
const MODEL = SONNET_MODEL;

/** First JSON object/array slice in model output (linear scan; no backtracking regex). */
function extractJsonText(raw) {
  const text = String(raw ?? '');
  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');
  if (objStart < 0 && arrStart < 0) return null;
  const useArr = arrStart >= 0 && (objStart < 0 || arrStart < objStart);
  const start = useArr ? arrStart : objStart;
  const endChar = useArr ? ']' : '}';
  const end = text.lastIndexOf(endChar);
  if (end <= start) return null;
  return text.slice(start, end + 1);
}

const GENERIC_SYSTEM = {
  he: `You translate JSON string values into modern Israeli Hebrew for civil-defense user UI. Preserve URLs, markdown links, IDs, and numbers. Return ONLY valid JSON with the exact same structure.`,
  ru: `You translate JSON string values into formal Russian for civil-defense user UI. Preserve URLs, markdown links, IDs, and numbers. Return ONLY valid JSON with the exact same structure.`,
};

/**
 * @param {object} payload
 * @param {'he' | 'ru'} lang
 * @param {{ useReportPrompt?: boolean, queryHint?: string, costLabel?: string, costDate?: string, sourceLang?: string }} [opts]
 */
export async function translateGenericJson(payload, lang, opts = {}) {
  const langName = LANG_NAMES[lang] ?? lang;
  const basePrompt = opts.useReportPrompt
    ? await buildReportSystemPrompt(lang, JSON.stringify(payload))
    : GENERIC_SYSTEM[lang];
  const system = await translationSystemPrompt(
    lang,
    basePrompt,
    opts.queryHint ?? JSON.stringify(payload).slice(0, 400),
  );

  const sourceLang = opts.sourceLang ?? 'en';
  const sourcePreamble = sourceLang === 'mixed'
    ? `Values may be in English or Hebrew — translate ALL of them into ${langName}.`
    : `Source language is ${LANG_NAMES[sourceLang] ?? sourceLang}.`;

  const message = await getDefaultLlmPort().createMessage({
    model: MODEL,
    max_tokens: 8000,
    callContext: { feature: 'translation', purpose: opts.costLabel ?? 'translation-generic' },
    system,
    messages: [{
      role: 'user',
      content: `${sourcePreamble} Translate the following JSON into ${langName}. Return ONLY valid JSON with the exact same structure.\n\n${JSON.stringify(payload)}`,
    }],
  });

  if (message.stop_reason === 'max_tokens') {
    throw new Error('Translation chunk truncated (max_tokens)');
  }

  const raw = message.content[0].text;
  const jsonText = extractJsonText(raw);
  if (!jsonText) throw new Error('Translation response contained no JSON');

  let result;
  try {
    result = JSON.parse(jsonText);
  } catch {
    result = JSON.parse(jsonrepair(jsonText));
  }

  if (opts.costLabel) {
    const cliMeta = transportMeta(getDefaultLlmPort());
    const costUsd = cliMeta.transport ? 0 : calcInvocationCostUsd(MODEL, message.usage);
    appendCostLog({
      script: opts.costLabel,
      date: opts.costDate ?? new Date().toISOString().slice(0, 10),
      totalCostUsd: costUsd,
      usageLog: [{ label: opts.costLabel, model: MODEL, usage: message.usage, cost: costUsd, ...cliMeta }],
    });
  }

  return { result, usage: message.usage };
}

/**
 * @param {object} payload
 * @param {'he' | 'ru'} lang
 * @param {object} [opts]
 */
export async function translateGenericJsonWithRetry(payload, lang, opts = {}) {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await translateGenericJson(payload, lang, opts);
    } catch (err) {
      const status = getErrStatus(err);
      const transient = isTransientTranslateError(err);
      if (!transient || attempt === MAX_ATTEMPTS) {
        const detail = status ? `HTTP ${status}` : (err?.message ?? 'unknown error');
        throw new Error(`Translation provider error (${detail})`, { cause: err });
      }
      const base = 750 * (2 ** (attempt - 1));
      await sleep(base + retryJitterMs(250));
    }
  }
  throw new Error('Translation provider error (exhausted retries)');
}

/**
 * Translate a long prose passage as plain text (no JSON wrapper) — the model
 * produces markedly more natural prose when it is not juggling JSON structure.
 *
 * @param {string} text
 * @param {'he' | 'ru'} lang
 * @param {{ queryHint?: string, costLabel?: string, costDate?: string, sourceLang?: string }} [opts]
 * @returns {Promise<{ result: string, usage: object }>}
 */
export async function translateProse(text, lang, opts = {}) {
  const langName = LANG_NAMES[lang] ?? lang;
  const basePrompt = await buildProseSystemPrompt(lang, text);
  const system = await translationSystemPrompt(lang, basePrompt, opts.queryHint ?? text.slice(0, 400));

  const sourceLang = opts.sourceLang ?? 'en';
  const sourceLabel = LANG_NAMES[sourceLang] ?? sourceLang;

  const message = await getDefaultLlmPort().createMessage({
    model: MODEL,
    max_tokens: 8000,
    callContext: { feature: 'translation', purpose: opts.costLabel ?? 'translation-prose' },
    system,
    messages: [{
      role: 'user',
      content: `Source language is ${sourceLabel}. Translate the following text into ${langName}. Return ONLY the translated text.\n\n${text}`,
    }],
  });

  if (message.stop_reason === 'max_tokens') {
    throw new Error('Prose translation truncated (max_tokens)');
  }
  const result = String(message.content?.[0]?.text ?? '').trim();
  if (!result) throw new Error('Prose translation returned empty text');

  if (opts.costLabel) {
    const cliMeta = transportMeta(getDefaultLlmPort());
    const costUsd = cliMeta.transport ? 0 : calcInvocationCostUsd(MODEL, message.usage);
    appendCostLog({
      script: opts.costLabel,
      date: opts.costDate ?? new Date().toISOString().slice(0, 10),
      totalCostUsd: costUsd,
      usageLog: [{ label: opts.costLabel, model: MODEL, usage: message.usage, cost: costUsd, ...cliMeta }],
    });
  }

  return { result, usage: message.usage };
}

/**
 * @param {string} text
 * @param {'he' | 'ru'} lang
 * @param {object} [opts]
 */
export async function translateProseWithRetry(text, lang, opts = {}) {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await translateProse(text, lang, opts);
    } catch (err) {
      const status = getErrStatus(err);
      const transient = isTransientTranslateError(err);
      if (!transient || attempt === MAX_ATTEMPTS) {
        const detail = status ? `HTTP ${status}` : (err?.message ?? 'unknown error');
        throw new Error(`Translation provider error (${detail})`, { cause: err });
      }
      const base = 750 * (2 ** (attempt - 1));
      await sleep(base + retryJitterMs(250));
    }
  }
  throw new Error('Translation provider error (exhausted retries)');
}

export { LANG_NAMES, MODEL };
