import { getDefaultLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { SONNET_MODEL } from '../../../cross-cut-modules/llm/modelIds.js';
import { jsonrepair } from 'jsonrepair';
import { calcInvocationCostUsd } from '../../../cross-cut-modules/budget/index.js';
import { appendCostLog } from '../../../cross-cut-modules/log/index.js';
import {
  getErrStatus,
  isTransientTranslateError,
  sleep,
} from './translationTranslateUtils.js';
import { translationSystemPrompt } from './translationTermRag.js';
import { buildReportSystemPrompt } from './translationGlossary.js';

const LANG_NAMES = { en: 'English', he: 'Hebrew', ru: 'Russian' };
const MODEL = SONNET_MODEL;

const GENERIC_SYSTEM = {
  he: `You translate JSON string values into modern Israeli Hebrew for civil-defense operator UI. Preserve URLs, markdown links, IDs, and numbers. Return ONLY valid JSON with the exact same structure.`,
  ru: `You translate JSON string values into formal Russian for civil-defense operator UI. Preserve URLs, markdown links, IDs, and numbers. Return ONLY valid JSON with the exact same structure.`,
};

/**
 * @param {object} payload
 * @param {'he' | 'ru'} lang
 * @param {{ useReportPrompt?: boolean, queryHint?: string, costLabel?: string, costDate?: string, sourceLang?: string }} [opts]
 */
export async function translateGenericJson(payload, lang, opts = {}) {
  const langName = LANG_NAMES[lang] ?? lang;
  const basePrompt = opts.useReportPrompt
    ? await buildReportSystemPrompt(lang)
    : GENERIC_SYSTEM[lang];
  const system = await translationSystemPrompt(
    lang,
    basePrompt,
    opts.queryHint ?? JSON.stringify(payload).slice(0, 400),
  );

  const sourceLang = opts.sourceLang ?? 'en';
  const sourceLabel = LANG_NAMES[sourceLang] ?? sourceLang;

  const message = await getDefaultLlmPort().createMessage({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [{
      role: 'user',
      content: `Source language is ${sourceLabel}. Translate the following JSON into ${langName}. Return ONLY valid JSON with the exact same structure.\n\n${JSON.stringify(payload)}`,
    }],
  });

  if (message.stop_reason === 'max_tokens') {
    throw new Error('Translation chunk truncated (max_tokens)');
  }

  const raw = message.content[0].text;
  const match = /\{[\s\S]*\}|\[[\s\S]*\]/.exec(raw);
  if (!match) throw new Error('Translation response contained no JSON');

  let result;
  try {
    result = JSON.parse(match[0]);
  } catch {
    result = JSON.parse(jsonrepair(match[0]));
  }

  if (opts.costLabel) {
    const costUsd = calcInvocationCostUsd(MODEL, message.usage);
    appendCostLog({
      script: opts.costLabel,
      date: opts.costDate ?? new Date().toISOString().slice(0, 10),
      totalCostUsd: costUsd,
      usageLog: [{ label: opts.costLabel, model: MODEL, usage: message.usage, cost: costUsd }],
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
      const jitter = Math.floor(Math.random() * 250);
      await sleep(base + jitter);
    }
  }
  throw new Error('Translation provider error (exhausted retries)');
}

export { LANG_NAMES, MODEL };
