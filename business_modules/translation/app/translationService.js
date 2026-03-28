import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = resolve(__dirname, '../../../reports');

const client = new Anthropic();

/** In-memory cache to avoid disk reads on repeat requests */
const memCache = new Map();

const LANG_NAMES = { he: 'Hebrew', ru: 'Russian' };

function cacheFilePath(date, lang) {
  return resolve(REPORTS_DIR, `translation-${date}-${lang}.json`);
}

async function readDiskCache(date, lang) {
  try {
    const raw = await readFile(cacheFilePath(date, lang), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeDiskCache(date, lang, report) {
  try {
    await writeFile(cacheFilePath(date, lang), JSON.stringify(report), 'utf8');
  } catch {
    /* non-fatal — translation still works, just won't persist */
  }
}

/**
 * Translate LLM-generated narrative fields in a report to the target language.
 * Translations are cached to disk in the reports/ directory and shared across
 * all users and server restarts.
 *
 * @param {object} report  – full assessment object
 * @param {string} lang    – 'he' | 'ru' (never 'en')
 * @returns {object} report with translated text fields
 */
export async function getTranslatedReport(report, lang) {
  if (!report || lang === 'en') return report;

  const key = `${report.date}_${lang}`;

  if (memCache.has(key)) return memCache.get(key);

  const fromDisk = await readDiskCache(report.date, lang);
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
    })),
  };

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `Translate the following JSON from English to ${langName}. Return ONLY valid JSON with the exact same structure. Do NOT translate component_id values. Translate all narrative / synthesis / caveats text.

${JSON.stringify(payload, null, 2)}`,
      },
    ],
  });

  const raw = message.content[0].text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Translation response did not contain JSON');

  const translated = JSON.parse(jsonMatch[0]);

  const translatedReport = {
    ...report,
    cross_component_synthesis:
      translated.cross_component_synthesis ?? report.cross_component_synthesis,
    media_bias_caveats: translated.media_bias_caveats ?? report.media_bias_caveats,
    components: (report.components ?? []).map((c, i) => ({
      ...c,
      narrative: translated.components?.[i]?.narrative ?? c.narrative,
    })),
  };

  memCache.set(key, translatedReport);
  await writeDiskCache(report.date, lang, translatedReport);
  return translatedReport;
}
