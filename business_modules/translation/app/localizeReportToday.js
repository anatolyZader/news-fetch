import { isLocalizedLang } from './parseLocale.js';
import { getTranslatedReport } from './translationService.js';
import { localizePayload } from './localePresentationService.js';

/** @typedef {{ path: string, originalKey?: string }} LocaleField */

/** @type {import('./localeSchemas.js').LocaleSchema} */
const DECISION_BRIEF_SCHEMA = {
  fields: [
    { path: 'decision_brief.summary' },
    { path: 'decision_brief.items[].rationale' },
    { path: 'decision_brief.items[].suggested_next_step' },
    { path: 'decision_brief.items[].summary' },
  ],
};

/**
 * Full localization for GET /api/report/today response.
 *
 * @param {object} payload
 * @param {string} lang
 */
export async function localizeReportTodayPayload(payload, lang) {
  if (!payload || !isLocalizedLang(lang)) return payload;

  let out = { ...payload };
  const dateExtra = out.assessment?.date ?? out.reportDate ?? '';

  try {
    if (out.assessment) {
      out = { ...out, assessment: await getTranslatedReport(out.assessment, lang) };
    }

    if (out.assessment?.decision_brief) {
      const briefWrap = { decision_brief: out.assessment.decision_brief };
      const localized = await localizePayload(
        briefWrap,
        'report.decisionBrief',
        lang,
        { fingerprintExtra: `${dateExtra}-brief`, costDate: dateExtra },
      );
      out = {
        ...out,
        assessment: { ...out.assessment, decision_brief: localized.decision_brief ?? out.assessment.decision_brief },
      };
    }

    out = await localizePayload(out, 'report.attention', lang, { fingerprintExtra: dateExtra, costDate: dateExtra });
    out = await localizePayload(out, 'report.actionCompass', lang, { fingerprintExtra: dateExtra, costDate: dateExtra });
    out = await localizePayload(out, 'report.wrapper', lang, { fingerprintExtra: dateExtra, costDate: dateExtra });
  } catch (err) {
    console.error(`[localize] translation failed for lang=${lang}, falling back to source:`, err?.message ?? err);
    return payload;
  }

  return out;
}

export { DECISION_BRIEF_SCHEMA };
