/**
 * Derive unified attention items from a (possibly redacted) assessment for operator/analyst UI.
 */

import {
  addClusterAttentionItems,
  addComponentAttentionItems,
  addDataVoidAttentionItems,
  addEpistemicAttentionItems,
  addGeoAttentionItems,
  addMacroAttentionItems,
  addOovAttentionItems,
  addOperatorRecommendationItems,
  addSocialQuarantineAttentionItems,
  createAttentionPush,
  DISPLAY_VIEWS,
} from './attentionItemsHelpers.js';

export const ATTENTION_LEVELS = Object.freeze({
  critical: 0,
  warning: 1,
  watch: 2,
  info: 3,
});

/**
 * @param {'critical'|'warning'|'watch'|'info'} level
 * @param {string} id
 * @param {string} code
 * @param {string} titleKey
 * @param {object} [extra]
 */
function item(level, id, code, titleKey, extra = {}) {
  return {
    id,
    level,
    code,
    title_key: titleKey,
    ...extra,
  };
}

/**
 * @param {object} a
 * @param {object} b
 */
function compareAttentionItems(a, b) {
  const la = ATTENTION_LEVELS[a.level] ?? 99;
  const lb = ATTENTION_LEVELS[b.level] ?? 99;
  if (la !== lb) return la - lb;
  const ca = a.component_id ?? '';
  const cb = b.component_id ?? '';
  if (ca !== cb) return ca.localeCompare(cb);
  return String(a.code).localeCompare(String(b.code));
}

/**
 * @param {object | null | undefined} assessment
 * @param {{ view?: 'operator' | 'analyst', reportScopeId?: string }} [opts]
 * @returns {Array<object>}
 */
export function buildAttentionItems(assessment, opts = {}) {
  if (!assessment || typeof assessment !== 'object') return [];

  const view = opts.view === DISPLAY_VIEWS.analyst
    ? DISPLAY_VIEWS.analyst
    : DISPLAY_VIEWS.operator;
  const isAnalyst = view === DISPLAY_VIEWS.analyst;
  const reportScopeId = opts.reportScopeId
    ?? assessment.report_scope?.id
    ?? 'national';

  const items = [];
  const seenIds = new Set();
  const push = createAttentionPush(items, seenIds);

  const dataVoid = assessment.data_void ?? null;
  const epistemicStatus = assessment.epistemic_status ?? null;
  const assessmentMode = assessment.assessment_mode ?? 'normal';
  const methodology = assessment.methodology ?? null;

  addDataVoidAttentionItems(push, item, dataVoid);
  addEpistemicAttentionItems(push, item, assessment, assessmentMode, epistemicStatus);
  addGeoAttentionItems(push, item, methodology, reportScopeId);
  addComponentAttentionItems(push, item, assessment.components, isAnalyst, {
    dataVoid,
    epistemicStatus,
  });
  addClusterAttentionItems(push, item, dataVoid);
  addSocialQuarantineAttentionItems(push, item, assessment.social_channel_quarantine ?? null);
  addMacroAttentionItems(push, item, assessment);
  addOovAttentionItems(push, item, assessment, isAnalyst, methodology);
  addOperatorRecommendationItems(push, item, assessment.operator_recommendations);

  items.sort(compareAttentionItems);
  return items;
}
