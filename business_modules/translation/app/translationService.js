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
  return `${report.date}_${report.total_articles_analyzed ?? 0}_${lang}`;
}

function cacheFilePath(date, articlesCount, lang) {
  return resolve(REPORTS_DIR, `translation-v2-${date}-${articlesCount}-${lang}.json`);
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
    /* non-fatal */
  }
}

/**
 * Send one small JSON payload to Claude and return the parsed result + usage.
 */
async function translateChunk(payload, lang, langName) {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: SYSTEM_PROMPT[lang],
    messages: [{
      role: 'user',
      content: `Translate the following JSON into ${langName}. Return ONLY valid JSON with the exact same structure.\n\n${JSON.stringify(payload)}`,
    }],
  });

  if (message.stop_reason === 'max_tokens') {
    throw new Error(`Translation chunk truncated (max_tokens). Payload keys: ${Object.keys(payload).join(', ')}`);
  }

  const raw = message.content[0].text;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Translation response contained no JSON');

  let result;
  try {
    result = JSON.parse(match[0]);
  } catch {
    result = JSON.parse(jsonrepair(match[0]));
  }

  return { result, usage: message.usage };
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
  if (memCache.has(key)) return memCache.get(key);

  const fromDisk = await readDiskCache(report, lang);
  if (fromDisk) {
    memCache.set(key, fromDisk);
    return fromDisk;
  }

  const langName = LANG_NAMES[lang] ?? lang;
  const components = report.components ?? [];

  // Collect unique signal evidence strings from score_by_source for translation.
  const scoreBySource = report.score_by_source ?? {};
  const allEvidenceStrings = new Set();
  for (const sourceData of Object.values(scoreBySource)) {
    for (const compData of Object.values(sourceData)) {
      for (const sig of (compData.signals ?? [])) {
        if (sig.evidence) allEvidenceStrings.add(sig.evidence);
      }
    }
  }
  const evidenceList = [...allEvidenceStrings];

  // Split evidence strings into batches of ≤50 to stay within max_tokens.
  const EVIDENCE_BATCH_SIZE = 50;
  const evidenceBatches = [];
  for (let i = 0; i < evidenceList.length; i += EVIDENCE_BATCH_SIZE) {
    evidenceBatches.push(evidenceList.slice(i, i + EVIDENCE_BATCH_SIZE));
  }

  // One call for synthesis + caveats, one call per component, batched calls for
  // signal evidence strings — all in parallel.
  const [synthesisChunk, ...rest] = await Promise.all([
    translateChunk({
      cross_component_synthesis: report.cross_component_synthesis ?? '',
      media_bias_caveats: report.media_bias_caveats ?? '',
    }, lang, langName),
    ...evidenceBatches.map((batch) =>
      translateChunk({ evidence_strings: batch }, lang, langName),
    ),
    ...components.map((c) => translateChunk({
      narrative: c.narrative ?? '',
      evidence: c.evidence ?? [],
    }, lang, langName)),
  ]);

  const evidenceChunks = rest.slice(0, evidenceBatches.length);
  const componentChunks = rest.slice(evidenceBatches.length);

  // Build lookup map: original evidence string → translated.
  const evidenceMap = {};
  let evidenceIdx = 0;
  for (const chunk of evidenceChunks) {
    (chunk.result.evidence_strings ?? []).forEach((translated) => {
      if (evidenceList[evidenceIdx]) evidenceMap[evidenceList[evidenceIdx]] = translated;
      evidenceIdx++;
    });
  }

  // Rebuild score_by_source with translated signal evidence strings.
  const translatedScoreBySource = {};
  for (const [source, sourceData] of Object.entries(scoreBySource)) {
    translatedScoreBySource[source] = {};
    for (const [compId, compData] of Object.entries(sourceData)) {
      translatedScoreBySource[source][compId] = {
        ...compData,
        signals: (compData.signals ?? []).map((sig) => ({
          ...sig,
          evidence: evidenceMap[sig.evidence] ?? sig.evidence,
        })),
      };
    }
  }

  // Aggregate token usage across all parallel calls for cost tracking.
  const allChunks = [synthesisChunk, ...evidenceChunks, ...componentChunks];
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
    media_bias_caveats:        synthesisChunk.result.media_bias_caveats        ?? report.media_bias_caveats,
    components: components.map((c, i) => ({
      ...c,
      narrative: componentChunks[i].result.narrative ?? c.narrative,
      evidence:  componentChunks[i].result.evidence  ?? c.evidence,
    })),
    score_by_source: Object.keys(translatedScoreBySource).length > 0 ? translatedScoreBySource : report.score_by_source,
  };

  memCache.set(key, translatedReport);
  await writeDiskCache(report, lang, translatedReport);
  return translatedReport;
}
