const TOOL_LABEL_KEYS = new Set([
  'lookup_signals',
  'get_source',
  'search_sources',
  'trace_component_timeline',
  'compare_dates',
  'get_component_evidence_bundle',
]);

/**
 * @param {{ phase?: string|null, toolName?: string|null, round?: number|null, maxRounds?: number|null }} state
 * @param {(key: string, params?: object) => string} t
 * @returns {string}
 */
export function resolveChatStreamLabel(state, t) {
  const phase = state?.phase ?? 'thinking';

  if (phase === 'preparing') {
    return t('chat.status.preparing');
  }

  if (phase === 'tool' && state?.toolName) {
    const toolKey = TOOL_LABEL_KEYS.has(state.toolName)
      ? `chat.status.tool.${state.toolName}`
      : 'chat.status.tool.generic';
    let label = t(toolKey);
    if (state.toolDetail) {
      label = `${label} — ${state.toolDetail}`;
    }
    if (state.round != null && state.maxRounds != null) {
      return `${label} ${t('chat.status.toolProgress', { round: state.round, maxRounds: state.maxRounds })}`;
    }
    return label;
  }

  return t('chat.status.thinking');
}

/**
 * @returns {number}
 */
export function chatClientTimeoutMs() {
  const raw = import.meta.env.VITE_CHAT_CLIENT_TIMEOUT_MS;
  const n = Number.parseInt(raw ?? '270000', 10);
  return Number.isFinite(n) && n > 0 ? n : 270_000;
}

/**
 * @param {number} elapsedSec
 * @param {(key: string, params?: object) => string} t
 * @returns {string|null}
 */
export function resolveSlowWarning(elapsedSec, t) {
  if (elapsedSec < 60) return null;
  const timeoutMin = Math.round(chatClientTimeoutMs() / 60_000 * 10) / 10;
  return t('chat.status.slowWarning', { timeoutMin });
}
