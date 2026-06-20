import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLOSSARY_PATH = resolve(__dirname, '../../../config/resilience-translation-glossary.json');

/** Resilience component names — listed first in prompt glossary blocks. */
const COMPONENT_TERM_IDS = new Set([
  'narrative_component',
  'information_sharing',
  'lifesaving_behavior',
  'functional_continuity',
  'community_capital',
  'leadership',
  'belonging_solidarity',
  'wellbeing_at_risk',
]);

/** @type {Array<{ id: string, en: string, he: string, ru: string, aliases?: string[] }> | null} */
let cachedTerms = null;

/**
 * @param {Array<{ id: string, en: string, he: string, ru: string }>} terms
 * @param {'he' | 'ru'} lang
 */
export function buildGlossaryBlock(terms, lang) {
  const components = [];
  const keyTerms = [];

  for (const term of terms) {
    const target = lang === 'he' ? term.he : term.ru;
    const line = `- ${term.en} → ${target}`;
    if (COMPONENT_TERM_IDS.has(term.id)) {
      components.push(line);
    } else {
      keyTerms.push(line);
    }
  }

  if (lang === 'he') {
    return `
Component name glossary (use these exact translations — do not paraphrase):
${components.join('\n')}

Key term glossary:
${keyTerms.join('\n')}`;
  }

  return `
Глоссарий названий компонентов (используйте эти точные переводы — без перефразировок):
${components.join('\n')}

Глоссарий ключевых терминов:
${keyTerms.join('\n')}`;
}

const STYLE_REQUIREMENTS = {
  he: `You are a professional translator specializing in Israeli civil defense and emergency management. You are translating a Home Front Command (פיקוד העורף) community resilience assessment report from English into modern Israeli Hebrew.

Style requirements:
- Use formal, analytical modern Israeli Hebrew (not biblical or archaic forms)
- Use established Israeli military/civilian defense terminology
- Maintain the analytical, evidence-based register of the original
- Gender: default to masculine plural for general population references unless context specifies otherwise
- Preserve all proper nouns (place names, organization names) as they appear`,

  ru: `You are a professional translator specializing in civil defense and emergency management. You are translating an Israeli Home Front Command community resilience assessment report from English into formal Russian.

Style requirements:
- Use formal, analytical Russian appropriate for official government/defense reporting
- Maintain the evidence-based, analytical register of the original
- Use established Russian civil defense and emergency management terminology
- Transliterate Israeli place names phonetically where no established Russian form exists`,
};

const JSON_RULES = `Return ONLY valid JSON with the exact same structure as the input. Do NOT translate field names or component_id values. Do NOT translate or alter URLs. Do NOT translate markdown link text — keep ([source](url)) and ([label](url)) patterns unchanged. Do NOT alter parenthetical citation text such as (Source Name, 20 Jun 2026).`;

/**
 * @returns {Promise<Array<{ id: string, en: string, he: string, ru: string, aliases?: string[] }>>}
 */
export async function loadGlossaryTerms() {
  if (!cachedTerms) {
    const raw = await readFile(GLOSSARY_PATH, 'utf8');
    cachedTerms = JSON.parse(raw);
  }
  return cachedTerms;
}

/** @param {'he' | 'ru'} lang */
export async function buildReportSystemPrompt(lang) {
  const terms = await loadGlossaryTerms();
  const glossary = buildGlossaryBlock(terms, lang);
  const style = STYLE_REQUIREMENTS[lang] ?? STYLE_REQUIREMENTS.ru;
  return `${style}\n\n${glossary}\n${JSON_RULES}`;
}

/** Test helper — reload glossary from disk. */
export function resetGlossaryCacheForTests() {
  cachedTerms = null;
}
