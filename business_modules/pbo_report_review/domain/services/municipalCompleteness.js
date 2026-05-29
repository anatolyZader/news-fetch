/**
 * Deterministic gap detection for municipal PBO Excel rows.
 * Pure domain logic — no I/O.
 */

import { createHash } from 'node:crypto';

export const GAP_KINDS = Object.freeze({
  missing_score: 'missing_score',
  missing_verbal_text: 'missing_verbal_text',
  thin_officer_coverage: 'thin_officer_coverage',
  sparse_row: 'sparse_row',
});

const GAP_PRIORITY = {
  missing_score: 1,
  missing_verbal_text: 2,
  thin_officer_coverage: 3,
  sparse_row: 0,
};

/**
 * @param {string} componentId
 * @param {string} kind
 * @returns {string}
 */
export function gapId(componentId, kind) {
  return componentId ? `${componentId}:${kind}` : kind;
}

/**
 * @param {object} municipality  { name, components }
 * @param {string[]} componentsOrder
 * @param {{ supplementalTexts?: Record<string, string> }} [opts]
 * @returns {{ sufficient: boolean, gaps: Array<object> }}
 */
export function computeMunicipalGaps(municipality, componentsOrder, opts = {}) {
  const supplementalTexts = opts.supplementalTexts ?? {};
  const gaps = [];
  let scoredCount = 0;

  for (const cid of componentsOrder) {
    const c = municipality.components?.[cid] ?? { avg: null, scores: [], texts: [] };
    if (c.avg != null) scoredCount += 1;

    if (c.avg == null) {
      gaps.push({
        id: gapId(cid, GAP_KINDS.missing_score),
        componentId: cid,
        kind: GAP_KINDS.missing_score,
        reason: `missing score for ${cid}`,
      });
      continue;
    }

    const hasVerbal = (c.texts?.length ?? 0) > 0 || Boolean(String(supplementalTexts[cid] ?? '').trim());
    if (!hasVerbal) {
      gaps.push({
        id: gapId(cid, GAP_KINDS.missing_verbal_text),
        componentId: cid,
        kind: GAP_KINDS.missing_verbal_text,
        reason: `missing verbal reference for ${cid}`,
      });
    }

    if ((c.scores?.length ?? 0) < 3) {
      gaps.push({
        id: gapId(cid, GAP_KINDS.thin_officer_coverage),
        componentId: cid,
        kind: GAP_KINDS.thin_officer_coverage,
        reason: `thin officer coverage for ${cid}`,
      });
    }
  }

  if (scoredCount < 4) {
    gaps.push({
      id: gapId(null, GAP_KINDS.sparse_row),
      componentId: null,
      kind: GAP_KINDS.sparse_row,
      reason: `sparse row: only ${scoredCount} components scored`,
    });
  }

  gaps.sort((a, b) => (GAP_PRIORITY[a.kind] ?? 99) - (GAP_PRIORITY[b.kind] ?? 99));

  return { sufficient: gaps.length === 0, gaps };
}

const UNIVERSAL_LOCALITY_QUESTION = {
  en: 'Which locality or area does this report refer to?',
  he: 'באיזה יישוב או אזור מדובר?',
  ru: 'К какому населённому пункту или району относится этот отчёт?',
};

/**
 * @param {Array<object>} gaps
 * @param {object} evidenceRequirements  EVIDENCE_REQUIREMENTS map
 * @param {{ he: Record<string,string>, en: Record<string,string> }} componentNames
 * @param {string} language  en|he|ru
 * @returns {Array<{ gapId: string, componentId: string|null, kind: string, label: string, text: string }>}
 */
export function buildQuestionsFromGaps(gaps, evidenceRequirements, componentNames, language = 'he') {
  const lang = ['en', 'he', 'ru'].includes(language) ? language : 'he';
  const labels = componentNames?.[lang === 'ru' ? 'en' : lang] ?? componentNames?.he ?? {};
  const seen = new Set();
  const questions = [];

  const missingScoreCount = gaps.filter((g) => g.kind === GAP_KINDS.missing_score).length;
  if (missingScoreCount >= 2 && !seen.has('locality')) {
    seen.add('locality');
    questions.push({
      gapId: 'locality',
      componentId: null,
      kind: 'universal',
      label: '',
      text: UNIVERSAL_LOCALITY_QUESTION[lang] ?? UNIVERSAL_LOCALITY_QUESTION.he,
    });
  }

  for (const gap of gaps) {
    if (seen.has(gap.id)) continue;
    const req = gap.componentId ? evidenceRequirements?.[gap.componentId] : null;
    const fallback = req?.fallbackQuestions?.[0];
    let text = fallback;
    if (!text) {
      if (gap.kind === GAP_KINDS.missing_score) {
        text = lang === 'en'
          ? 'Please provide a score and brief observation for this component.'
          : lang === 'ru'
            ? 'Пожалуйста, укажите оценку и краткое наблюдение по этому компоненту.'
            : 'נא להשלים ציון והתייחסות קצרה למרכיב זה.';
      } else if (gap.kind === GAP_KINDS.missing_verbal_text) {
        text = lang === 'en'
          ? 'Please add a verbal reference describing what you observed for this component.'
          : lang === 'ru'
            ? 'Добавьте текстовое описание наблюдений по этому компоненту.'
            : 'נא להוסיף התייחסות מילולית לתצפית במרכיב זה.';
      } else if (gap.kind === GAP_KINDS.thin_officer_coverage) {
        text = lang === 'en'
          ? 'Only one or two officer scores were recorded — can you add another officer observation or clarify scope?'
          : lang === 'ru'
            ? 'Записана оценка одного–двух офицеров — добавьте наблюдение ещё одного офицера или уточните масштаб.'
            : 'נרשמו ציונים של מעט קב"טים — האם ניתן להוסיף תצפית נוספת או לפרט את ההיקף?';
      } else if (gap.kind === GAP_KINDS.sparse_row) {
        text = lang === 'en'
          ? 'Most components are empty — please complete scores for all eight resilience components.'
          : lang === 'ru'
            ? 'Большинство компонентов пусты — заполните оценки по всем восьми компонентам устойчивости.'
            : 'רוב המרכיבים ריקים — נא להשלים ציונים לכל שמונה מרכיבי החוסן.';
      }
    }
    seen.add(gap.id);
    questions.push({
      gapId: gap.id,
      componentId: gap.componentId,
      kind: gap.kind,
      label: gap.componentId ? (labels[gap.componentId] ?? gap.componentId) : '',
      text: String(text ?? '').trim(),
    });
  }

  return questions.filter((q) => q.text);
}

/**
 * @param {Array<object>} gaps
 * @returns {string}
 */
export function computeGapsHash(gaps) {
  const keys = gaps.map((g) => g.id).sort();
  return createHash('sha256').update(keys.join('|')).digest('hex').slice(0, 16);
}

/**
 * @param {object} municipality
 * @param {string[]} componentsOrder
 * @param {object} evidenceRequirements
 * @param {{ he: Record<string,string>, en: Record<string,string> }} componentNames
 * @param {string} language
 * @param {{ supplementalTexts?: Record<string, string> }} [opts]
 */
export function reviewMunicipalityRow(municipality, componentsOrder, evidenceRequirements, componentNames, language, opts = {}) {
  const { sufficient, gaps } = computeMunicipalGaps(municipality, componentsOrder, opts);
  const questions = sufficient ? [] : buildQuestionsFromGaps(gaps, evidenceRequirements, componentNames, language);
  return {
    sufficient,
    gaps,
    questions,
    gapsHash: computeGapsHash(gaps),
  };
}

/**
 * Merge reply answers into supplemental text map keyed by componentId.
 * @param {Array<{ gapId: string, text: string }>} answers
 * @param {Array<object>} gaps
 * @returns {Record<string, string>}
 */
export function supplementalTextsFromAnswers(answers, gaps) {
  const byGap = new Map(gaps.map((g) => [g.id, g]));
  const out = {};
  for (const ans of answers ?? []) {
    const gap = byGap.get(ans.gapId);
    const text = String(ans.text ?? '').trim();
    if (!text || !gap?.componentId) continue;
    out[gap.componentId] = out[gap.componentId]
      ? `${out[gap.componentId]} | ${text}`
      : text;
  }
  return out;
}

/**
 * @param {Array<object>} gaps
 * @param {Record<string, string>} supplementalTexts
 * @returns {'open'|'partially_resolved'|'resolved'}
 */
export function deriveReviewStatus(gaps, supplementalTexts) {
  if (!gaps.length) return 'resolved';
  const open = gaps.filter((g) => {
    if (g.kind === GAP_KINDS.missing_verbal_text && g.componentId) {
      return !String(supplementalTexts[g.componentId] ?? '').trim();
    }
    if (g.kind === GAP_KINDS.missing_score) return true;
    if (g.kind === GAP_KINDS.sparse_row) return true;
    if (g.kind === GAP_KINDS.thin_officer_coverage) return true;
    return true;
  });
  if (open.length === 0) return 'resolved';
  if (open.length < gaps.length) return 'partially_resolved';
  return 'open';
}
