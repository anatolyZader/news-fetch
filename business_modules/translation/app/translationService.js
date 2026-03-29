import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = resolve(__dirname, '../../../reports');

const client = new Anthropic();

/** In-memory cache to avoid disk reads on repeat requests */
const memCache = new Map();

const LANG_NAMES = { he: 'Hebrew', ru: 'Russian' };

/**
 * Cache key includes total_articles_analyzed so a new run today (different article count)
 * naturally invalidates the previous translation.
 */
function cacheKey(report, lang) {
  return `${report.date}_${report.total_articles_analyzed ?? 0}_${lang}`;
}

function cacheFilePath(date, articlesCount, lang) {
  return resolve(REPORTS_DIR, `translation-${date}-${articlesCount}-${lang}.json`);
}

async function readDiskCache(report, lang) {
  try {
    const raw = await readFile(cacheFilePath(report.date, report.total_articles_analyzed ?? 0, lang), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeDiskCache(report, lang, translatedReport) {
  try {
    await writeFile(
      cacheFilePath(report.date, report.total_articles_analyzed ?? 0, lang),
      JSON.stringify(translatedReport),
      'utf8',
    );
  } catch {
    /* non-fatal — translation still works, just won't persist */
  }
}

/**
 * Translate LLM-generated narrative and evidence fields in a report to the target language.
 * Translations are cached to disk in the reports/ directory and shared across
 * all users and server restarts. The cache key includes total_articles_analyzed so
 * a new analysis run today naturally invalidates the previous translation.
 *
 * @param {object} report  – full assessment object
 * @param {string} lang    – 'he' | 'ru' (never 'en')
 * @returns {object} report with translated text fields
 */
export async function getTranslatedReport(report, lang) {
  if (!report || lang === 'en') return report;

  const key = cacheKey(report, lang);

  if (memCache.has(key)) return memCache.get(key);

  const fromDisk = await readDiskCache(report, lang);
  if (fromDisk) {
    memCache.set(key, fromDisk);
    return fromDisk;
  }

  const langName = LANG_NAMES[lang] ?? lang;

  const payload = {
    cross_component_synthesis: report.cross_component_synthesis ?? '',
    media_bias_caveats: report.media_bias_caveats ?? '',
    components: (report.components ?? []).map((c) => ({
      component_id: c.component_id,
      narrative: c.narrative ?? '',
      evidence: c.evidence ?? [],
    })),
  };

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16000,
    messages: [
      {
        role: 'user',
        content: `Translate the following JSON from English to ${langName}. Return ONLY valid JSON with the exact same structure. Do NOT translate component_id values. Do NOT translate or alter URLs (strings starting with https://). Translate all narrative, synthesis, caveats, and evidence text.

${JSON.stringify(payload, null, 2)}`,
      },
    ],
  });

  const raw = message.content[0].text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Translation response did not contain JSON');

  let translated;
  try {
    translated = JSON.parse(jsonMatch[0]);
  } catch {
    translated = JSON.parse(jsonrepair(jsonMatch[0]));
  }

  const translatedReport = {
    ...report,
    cross_component_synthesis:
      translated.cross_component_synthesis ?? report.cross_component_synthesis,
    media_bias_caveats: translated.media_bias_caveats ?? report.media_bias_caveats,
    components: (report.components ?? []).map((c, i) => ({
      ...c,
      narrative: translated.components?.[i]?.narrative ?? c.narrative,
      evidence: translated.components?.[i]?.evidence ?? c.evidence,
    })),
  };

  memCache.set(key, translatedReport);
  await writeDiskCache(report, lang, translatedReport);
  return translatedReport;
}
