/** Canonical in-process metric / span names (OTel-compatible dot notation). */

export const METRIC = Object.freeze({
  CHAT_REQUEST: 'chat.request',
  CHAT_RETRIEVAL_HINT: 'chat.retrieval_hint',
  CHAT_LLM_STREAM: 'chat.llm_stream',
  MONITORING_GET_SUMMARY: 'monitoring.getSummary',
  MONITORING_GET_PIPELINE_STATUS: 'monitoring.getPipelineStatus',
  MONITORING_GET_HEALTH: 'monitoring.getHealth',
  APP_CHECK_SOFT: 'security.app_check.soft',
  SQLITE_HYBRID_RETRIEVE: 'sqlite.hybrid_retrieve',
  SQLITE_DENSE_SEARCH: 'sqlite.dense_search',
  SQLITE_FTS_SEARCH: 'sqlite.fts_search',
});

/** @param {string} spanName */
export function durationMetricName(spanName) {
  return `${spanName}.duration_ms`;
}
