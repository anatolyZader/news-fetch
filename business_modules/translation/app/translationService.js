import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { calcInvocationCostUsd, appendCostLog } from '../../../cross-cut-modules/budget/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = resolve(__dirname, '../../../reports');

const client = new Anthropic();

/** In-memory cache to avoid disk reads on repeat requests */
const memCache = new Map();

const LANG_NAMES = { he: 'Hebrew', ru: 'Russian' };

/**
 * Fixed glossary for the 8 resilience components and core domain terms.
 * Ensures consistency across all translated reports.
 */
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
- cross_component_synthesis → סינתזה בין-מרכיבית
- media_bias_caveats → הסתייגויות הטיית מדיה
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
Return ONLY valid JSON with the exact same structure as the input. Do NOT translate component_id values. Do NOT translate or alter URLs.`,

  ru: `You are a professional translator specializing in civil defense and emergency management. You are translating an Israeli Home Front Command community resilience assessment report from English into formal Russian.

Style requirements:
- Use formal, analytical Russian appropriate for official government/defense reporting
- Maintain the evidence-based, analytical register of the original
- Use established Russian civil defense and emergency management terminology
- Transliterate Israeli place names phonetically where no established Russian form exists

${GLOSSARY.ru}
Return ONLY valid JSON with the exact same structure as the input. Do NOT translate component_id values. Do NOT translate or alter URLs.`,
};

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
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: SYSTEM_PROMPT[lang],
    messages: [
      {
        role: 'user',
        content: `Translate the following JSON into ${langName}. Return ONLY valid JSON with the exact same structure. Translate all narrative, synthesis, caveats, and evidence text fields.

${JSON.stringify(payload, null, 2)}`,
      },
    ],
  });

  const translationModel = 'claude-sonnet-4-6';
  const costUsd = calcInvocationCostUsd(translationModel, message.usage);
  appendCostLog({
    script: `translation-${lang}`,
    date: report.date,
    totalCostUsd: costUsd,
    usageLog: [{ label: `translate-${lang}`, model: translationModel, usage: message.usage, cost: costUsd }],
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
