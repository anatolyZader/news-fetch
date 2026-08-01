import { loadMergedGlossaryTerms } from '../../../cross-cut-modules/config/translationGlossarySource.js';
import { createLogger } from '../../../cross-cut-modules/log/index.js';

const log = createLogger('translation');

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

/** Display order + labels for key-term categories in the prompt glossary. */
const CATEGORY_LABELS = {
  civil_defense: { en: 'Civil defense & alerts', ru: 'Гражданская оборона и оповещение' },
  military: { en: 'Military & security', ru: 'Военная сфера и безопасность' },
  emergency_services: { en: 'Emergency services', ru: 'Экстренные службы' },
  hazards: { en: 'Hazards & infrastructure', ru: 'Угрозы и инфраструктура' },
  community: { en: 'Community & welfare', ru: 'Община и социальная сфера' },
  methodology: { en: 'Report methodology', ru: 'Методология отчёта' },
  other: { en: 'Other', ru: 'Прочее' },
};

/** @type {Array<{ id: string, en: string, he: string, ru: string, category?: string, aliases?: string[] }> | null} */
let cachedTerms = null;

/**
 * Keep component names always; keep a key term only when its English surface
 * form (or an alias) actually appears in the source text. With no source text,
 * keep everything (legacy behavior).
 *
 * @param {Array<{ id: string, en: string, aliases?: string[] }>} terms
 * @param {string} [sourceText]
 */
export function filterTermsForSource(terms, sourceText) {
  const haystack = String(sourceText ?? '').toLowerCase();
  if (!haystack.trim()) return terms;

  return terms.filter((term) => {
    if (COMPONENT_TERM_IDS.has(term.id)) return true;
    const needles = [
      ...String(term.en ?? '').split('/'),
      ...(Array.isArray(term.aliases) ? term.aliases : []),
    ];
    return needles.some((n) => {
      const needle = String(n).replaceAll(/\([^()]*\)/g, '').trim().toLowerCase();
      return needle.length >= 3 && haystack.includes(needle);
    });
  });
}

/**
 * @param {Array<{ id: string, en: string, he: string, ru: string, category?: string }>} terms
 * @param {'he' | 'ru'} lang
 */
export function buildGlossaryBlock(terms, lang) {
  const components = [];
  /** @type {Map<string, string[]>} */
  const byCategory = new Map();

  for (const term of terms) {
    const target = lang === 'he' ? term.he : term.ru;
    const line = `- ${term.en} → ${target}`;
    if (COMPONENT_TERM_IDS.has(term.id)) {
      components.push(line);
      continue;
    }
    const category = CATEGORY_LABELS[term.category] ? term.category : 'other';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(line);
  }

  const labelLang = lang === 'he' ? 'en' : 'ru';
  const keyTermSections = Object.keys(CATEGORY_LABELS)
    .filter((category) => byCategory.has(category))
    .map((category) => `${CATEGORY_LABELS[category][labelLang]}:\n${byCategory.get(category).join('\n')}`)
    .join('\n\n');

  if (lang === 'he') {
    return `
Component name glossary (use these exact translations — do not paraphrase):
${components.join('\n')}

Key term glossary — use these exact Hebrew terms; they are the established Israeli civil-defense / military / emergency-management forms:

${keyTermSections}`;
  }

  return `
Глоссарий названий компонентов (используйте эти точные переводы — без перефразировок):
${components.join('\n')}

Глоссарий ключевых терминов — используйте именно эти устоявшиеся термины:

${keyTermSections}`;
}

const STYLE_REQUIREMENTS = {
  he: `You are a professional translator specializing in Israeli civil defense and emergency management. You are translating a Home Front Command (פיקוד העורף) community resilience assessment report from English into modern Israeli Hebrew.

Style requirements:
- Use formal, analytical modern Israeli Hebrew (not biblical or archaic forms)
- Use established Israeli military/civilian defense terminology
- Maintain the analytical, evidence-based register of the original
- Split long run-on sentences into shorter natural Hebrew sentences; do NOT mirror English sentence length or clause order
- Avoid calqued connectives: never open successive sentences with the same literal translation of "Separately," ("בנפרד") — vary or drop connectives as natural Hebrew requires
- The analytical term "register" means a mode/tone of response (סגנון תגובה, אופן ביטוי) — never רישום
- Use Hebrew quotation conventions (״…״ or '…'), not English curly quotes
- Gender: default to masculine plural for general population references unless context specifies otherwise
- Preserve all proper nouns (place names, organization names) as they appear`,

  ru: `You are a professional translator specializing in civil defense and emergency management. You are translating an Israeli Home Front Command community resilience assessment report from English into formal Russian.

Style requirements:
- Use formal, analytical Russian appropriate for official government/defense reporting
- Maintain the evidence-based, analytical register of the original
- Split long run-on sentences into shorter natural Russian sentences; do NOT mirror English sentence length or clause order
- Avoid calqued connectives: never open successive sentences with the same literal translation of "Separately," ("Отдельно") — vary or drop connectives as natural Russian requires
- The analytical term "register" means a mode/tone of response (тональность, характер реакции) — never запись/регистр в бюрократическом смысле
- Use established Russian civil defense and emergency management terminology
- Transliterate Israeli place names phonetically where no established Russian form exists`,
};

const CITATION_RULES = `Parenthetical citations such as (Field visit, 2026-03-24) or (ynet.co.il, 25 Mar 2026): translate the label words (e.g. "Field visit") into the target language, but keep date tokens (e.g. "25 Mar 2026", "2026-03-24") and domain names (e.g. "ynet.co.il") EXACTLY as they appear — byte-identical.`;

const JSON_RULES = `Return ONLY valid JSON with the exact same structure as the input. Do NOT translate field names or component_id values. Do NOT translate or alter URLs. Do NOT translate markdown link text — keep ([source](url)) and ([label](url)) patterns unchanged. ${CITATION_RULES}`;

const PROSE_RULES = `Return ONLY the translated text — no preamble, no commentary, no quotes around the output. Do NOT translate or alter URLs; keep markdown link syntax ([label](url)) unchanged. ${CITATION_RULES}`;

/**
 * Base glossary merged with operator overrides from
 * business_modules/translation/glossary/translation-glossary-overrides.json
 * (see translationGlossarySource.js).
 * @returns {Promise<Array<{ id: string, en: string, he: string, ru: string, category?: string, aliases?: string[] }>>}
 */
export async function loadGlossaryTerms() {
  if (!cachedTerms) {
    const { terms, warnings } = await loadMergedGlossaryTerms();
    for (const w of warnings) log.warn(w);
    cachedTerms = terms;
  }
  return cachedTerms;
}

/**
 * @param {'he' | 'ru'} lang
 * @param {string} [sourceText] – when given, key terms not present in it are dropped
 */
export async function buildReportSystemPrompt(lang, sourceText) {
  const terms = filterTermsForSource(await loadGlossaryTerms(), sourceText);
  const glossary = buildGlossaryBlock(terms, lang);
  const style = STYLE_REQUIREMENTS[lang] ?? STYLE_REQUIREMENTS.ru;
  return `${style}\n\n${glossary}\n${JSON_RULES}`;
}

/**
 * Same style + glossary, but for plain-text prose output (no JSON wrapper).
 * @param {'he' | 'ru'} lang
 * @param {string} [sourceText] – when given, key terms not present in it are dropped
 */
export async function buildProseSystemPrompt(lang, sourceText) {
  const terms = filterTermsForSource(await loadGlossaryTerms(), sourceText);
  const glossary = buildGlossaryBlock(terms, lang);
  const style = STYLE_REQUIREMENTS[lang] ?? STYLE_REQUIREMENTS.ru;
  return `${style}\n\n${glossary}\n${PROSE_RULES}`;
}

/** Test helper — reload glossary from disk. */
export function resetGlossaryCacheForTests() {
  cachedTerms = null;
}
