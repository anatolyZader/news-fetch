/** Canonical in-process metric / span names (OTel-compatible dot notation). */

export const METRIC = Object.freeze({
  HTTP_REQUEST_DURATION: 'http.request.duration_ms',
  HTTP_REQUESTS: 'http.requests',
  CHAT_TURN_DURATION: 'chat.turn.duration_ms',
  EVENT_LOOP_DELAY_P50: 'runtime.event_loop_delay.p50_ms',
  EVENT_LOOP_DELAY_P99: 'runtime.event_loop_delay.p99_ms',
  EVENT_LOOP_DELAY_MAX: 'runtime.event_loop_delay.max_ms',
  HEAP_USED_BYTES: 'runtime.heap_used_bytes',
  RSS_BYTES: 'runtime.rss_bytes',
  ACTIVE_SSE_STREAMS: 'chat.active_sse_streams',
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
