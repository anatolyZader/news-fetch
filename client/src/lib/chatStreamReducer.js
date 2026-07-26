import { isPlanningOnlyReply } from './chatPlanningGuard.js';

/**
 * @returns {{ phase: string|null, toolName: string|null, round: number|null, maxRounds: number|null, startedAt: number|null }}
 */
export function initialChatStreamState() {
  return {
    phase: null,
    toolName: null,
    toolDetail: null,
    round: null,
    maxRounds: null,
    startedAt: null,
  };
}

function accumulateCitations(accRef, citations) {
  const acc = accRef.citations ?? (accRef.citations = []);
  for (const c of citations ?? []) {
    if (c?.source_id && !acc.some((x) => x.source_id === c.source_id)) {
      acc.push(c);
    }
  }
}

/** Events that only mutate the turn accumulator (no state/terminal change). */
function applyAccumulatorEvent(event, accRef) {
  if (event.type === 'text') {
    accRef.value += event.text ?? '';
    return true;
  }
  if (event.type === 'citation') {
    accumulateCitations(accRef, event.citations);
    return true;
  }
  if (event.type === 'citations_final') {
    // Server-grounded set (used/consulted flags) replaces the streamed one.
    if (Array.isArray(event.citations)) {
      accRef.citations = event.citations.filter((c) => c?.source_id);
    }
    return true;
  }
  if (event.type === 'suggestions') {
    if (Array.isArray(event.items)) {
      accRef.suggestions = event.items.filter((s) => typeof s === 'string' && s.trim());
    }
    return true;
  }
  return false;
}

/**
 * @param {ReturnType<typeof initialChatStreamState>} state
 * @param {object} event
 * @param {{ value: string, citations?: Array<object> }} accRef
 * @returns {{ state: ReturnType<typeof initialChatStreamState>, terminal: string|null, event: object|null }}
 */
export function reduceChatStreamEvent(state, event, accRef) {
  if (event.type === 'status') {
    return {
      state: {
        ...state,
        phase: String(event.phase ?? 'thinking'),
        toolName: null,
      },
      terminal: null,
      event: null,
    };
  }

  if (event.type === 'tool_start') {
    return {
      state: {
        ...state,
        phase: 'tool',
        toolName: String(event.name ?? ''),
        toolDetail: event.detail ? String(event.detail) : null,
        round: Number.isFinite(event.round) ? event.round : null,
        maxRounds: Number.isFinite(event.maxRounds) ? event.maxRounds : null,
      },
      terminal: null,
      event: null,
    };
  }

  if (applyAccumulatorEvent(event, accRef)) {
    return { state, terminal: null, event: null };
  }

  if (event.type === 'action_proposed') {
    return { state, terminal: null, event };
  }

  if (event.type === 'done' || event.type === 'error') {
    return { state, terminal: event.type, event };
  }

  return { state, terminal: null, event: null };
}

/**
 * @param {object|null|undefined} doneEvent
 * @param {string} content
 * @returns {{ banner?: string }}
 */
export function buildAssistantTurnMeta(doneEvent, content) {
  if (!doneEvent) return {};

  if (doneEvent.error) {
    return { banner: 'error' };
  }

  if (doneEvent.loop_exhausted) {
    return { banner: 'loop_exhausted' };
  }

  if (doneEvent.mode === 'deterministic_fallback') {
    return { banner: 'deterministic_fallback' };
  }

  if (isPlanningOnlyReply(content)) {
    return { banner: 'planning_only' };
  }

  return {};
}

/**
 * @param {object|null|undefined} doneEvent
 * @param {string} accumulated
 * @returns {string}
 */
export function resolveAssistantErrorContent(doneEvent, accumulated) {
  if (doneEvent?.message) return String(doneEvent.message);
  if (doneEvent?.error && accumulated) return accumulated;
  return doneEvent?.message || accumulated || 'An error occurred';
}
