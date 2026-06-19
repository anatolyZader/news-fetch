/**
 * Declarative locale schemas: resource id → translatable JSON paths.
 */

/** @typedef {{ path: string, originalKey?: string }} LocaleField */

/** @typedef {{ fields: LocaleField[], chunkSize?: number }} LocaleSchema */

/** @type {Record<string, LocaleSchema>} */
export const LOCALE_SCHEMAS = {
  'news.daily': {
    fields: [
      { path: 'articles[].title', originalKey: 'titleOriginal' },
      { path: 'articles[].body', originalKey: 'bodyOriginal' },
    ],
  },
  'radio.daily': {
    fields: [
      { path: 'segments[].title', originalKey: 'titleOriginal' },
      { path: 'segments[].body', originalKey: 'bodyOriginal' },
    ],
  },
  'social.dailyMeta': {
    fields: [
      { path: 'summary' },
      { path: 'accessLimitations[]' },
      { path: 'threatPerception' },
      { path: 'knowledge' },
    ],
  },
  'visits.list': {
    fields: [
      { path: 'days[].visits[].title', originalKey: 'titleOriginal' },
      { path: 'days[].visits[].notes', originalKey: 'notesOriginal' },
      { path: 'days[].visits[].stakeholders', originalKey: 'stakeholdersOriginal' },
      { path: 'days[].visits[].notePoints[]' },
      { path: 'days[].visits[].signals[].evidence' },
    ],
  },
  'education.sessions': {
    fields: [
      { path: 'recentComments[].comment' },
      { path: 'communityActivitiesComments[].comment' },
      { path: 'bySettlement[].comments[].comment' },
      { path: 'bySettlement[].communityComments[].comment' },
      { path: 'sessions[].openComment' },
      { path: 'sessions[].communityActivities' },
    ],
  },
  'naftali.pool': {
    fields: [
      { path: 'recentComments[].mainChallenge' },
      { path: 'recentComments[].urgentNeeds' },
      { path: 'recentComments[].additionalComments' },
      { path: 'byMunicipality[].freeText.mainChallenge' },
      { path: 'byMunicipality[].freeText.urgentNeeds' },
    ],
  },
  'municipalities.dashboard': {
    fields: [
      { path: 'municipalities[].name' },
      { path: 'municipalities[].components[].texts[]' },
    ],
  },
  'pbo.regionalReport': {
    fields: [
      { path: 'days[].title', originalKey: 'titleOriginal' },
      { path: 'days[].excerpt', originalKey: 'excerptOriginal' },
      { path: 'days[].content', originalKey: 'contentOriginal' },
    ],
  },
  'pbo.historicalSearch': {
    fields: [
      { path: 'hits[].title' },
      { path: 'hits[].snippet' },
    ],
  },
  'pbo.municipalReview': {
    fields: [
      { path: 'reviews[].gaps[]' },
      { path: 'reviews[].questions[].text' },
      { path: 'reviews[].questions[].label' },
      { path: 'replies[].rawText' },
      { path: 'replies[].answers[].text' },
    ],
  },
  'reportBot.list': {
    fields: [
      { path: 'files[].snippet' },
    ],
  },
  'reportBot.file': {
    fields: [
      { path: 'content', originalKey: 'contentOriginal' },
    ],
  },
  'docs.index': {
    fields: [
      { path: 'pages[].title' },
      { path: 'pages[].description' },
    ],
  },
  'docs.page': {
    fields: [
      { path: 'markdown', originalKey: 'markdownOriginal' },
    ],
    chunkSize: 1,
  },
  'docs.search': {
    fields: [
      { path: 'hits[].title' },
      { path: 'hits[].snippet' },
    ],
  },
  'validation.queue': {
    fields: [
      { path: 'items[].signals[].evidence' },
    ],
  },
  'validation.context': {
    fields: [
      { path: 'rag.similar_articles[].title' },
      { path: 'rag.similar_articles[].snippet' },
      { path: 'rag.oov_neighbors.samples[]' },
    ],
  },
  'validation.answer': {
    fields: [
      { path: 'answer' },
    ],
  },
  'catalog.proposals': {
    fields: [
      { path: 'proposals[].suggested_label' },
      { path: 'proposals[].suggested_definition' },
      { path: 'proposals[].rationale' },
    ],
  },
  'drift.dashboard': {
    fields: [
      { path: 'alerts[].message' },
    ],
  },
  'report.attention': {
    fields: [
      { path: 'attention_items[].brief_rationale' },
      { path: 'attention_items[].brief_next_step' },
    ],
  },
  'report.actionCompass': {
    fields: [
      { path: 'action_compass[].why_now_text' },
      { path: 'action_compass[].success_signal_text' },
      { path: 'action_compass[].suggested_next_step' },
    ],
  },
  'report.wrapper': {
    fields: [
      { path: 'markdown', originalKey: 'markdownOriginal' },
      { path: 'markdown_brief', originalKey: 'markdownBriefOriginal' },
    ],
  },
  'report.decisionBrief': {
    fields: [
      { path: 'decision_brief.summary' },
      { path: 'decision_brief.items[].rationale' },
      { path: 'decision_brief.items[].suggested_next_step' },
      { path: 'decision_brief.items[].summary' },
    ],
  },
};

/**
 * @param {string} resourceId
 * @returns {LocaleSchema | null}
 */
export function getLocaleSchema(resourceId) {
  return LOCALE_SCHEMAS[resourceId] ?? null;
}
