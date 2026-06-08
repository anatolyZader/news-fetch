/**
 * Optional RAG lookup for translation glossary (namespace=terms).
 */
import { translationTermRagEnabled } from './ragConfig.js';
import { TERMS_INDEX_DATE } from './translationGlossaryIndexWriter.js';

/**
 * @param {string} query
 * @param {{ retrieval?: object, topK?: number }} opts
 * @returns {Promise<Array<{ id: string, en: string, he: string, ru: string, snippet: string }>>}
 */
export async function searchTranslationTerms(query, opts = {}) {
  if (!translationTermRagEnabled() || !opts.retrieval?.hybridRetrieve) {
    return [];
  }
  const q = String(query ?? '').trim();
  if (!q) return [];

  const hits = await opts.retrieval.hybridRetrieve(q, {
    namespaces: ['terms'],
    reportDate: TERMS_INDEX_DATE,
    dateFrom: TERMS_INDEX_DATE,
    dateTo: TERMS_INDEX_DATE,
    dateWindowDays: 1,
    topKFinal: opts.topK ?? 3,
    candidatePool: 12,
    skipRerank: true,
  });

  return hits.map((h) => {
    const id = String(h.parentId ?? '').replace(/^terms:/, '');
    const text = String(h.text ?? '');
    const pick = (key) => {
      const re = new RegExp(String.raw`${key}:\s*(.+)$`, 'm');
      const m = re.exec(text);
      return m ? m[1].trim() : '';
    };
    return {
      id,
      en: pick('en'),
      he: pick('he'),
      ru: pick('ru'),
      snippet: text.slice(0, 240),
    };
  });
}

function translationTermForLang(term, lang) {
  if (lang === 'he') return term.he;
  if (lang === 'ru') return term.ru;
  return term.en;
}

/**
 * @param {string} lang
 * @param {string} queryHint
 * @param {{ retrieval?: object }} opts
 */
export async function buildTranslationTermBlock(lang, queryHint, opts = {}) {
  const terms = await searchTranslationTerms(queryHint, { ...opts, topK: 3 });
  if (!terms.length) return '';

  const lines = terms.map((t) => {
    const target = translationTermForLang(t, lang);
    return `- ${t.en || t.id}: ${target || t.snippet}`;
  });
  return `\nRetrieved glossary terms (use exact translations):\n${lines.join('\n')}\n`;
}
