/**
 * Zero-spend chat LLM adapter for load testing (CHAT_LLM_STUB=true).
 * Implements IChatLlmPort with canned streaming output — never calls an LLM,
 * never touches retrieval, records no cost.
 */

const STUB_DELTAS = 20;
const STUB_DELTA_DELAY_MS = 30;

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
      }, { once: true });
    }
  });
}

/**
 * @param {{ deltaCount?: number, deltaDelayMs?: number }} [opts]
 * @returns {import('../../domain/ports/IChatLlmPort.js').IChatLlmPort}
 */
export function createStubChatAdapter(opts = {}) {
  const deltaCount = opts.deltaCount ?? STUB_DELTAS;
  const deltaDelayMs = opts.deltaDelayMs ?? STUB_DELTA_DELAY_MS;

  return {
    async streamChatResponse(_systemContext, _pboLookup, _messages, send, _reportData, callOpts = {}) {
      const signal = callOpts.abortSignal ?? null;
      send({ type: 'status', message: 'stub adapter responding' });
      let assistantText = '';
      for (let i = 0; i < deltaCount; i += 1) {
        if (signal?.aborted) break;
        await delay(deltaDelayMs, signal);
        const text = `stub delta ${i + 1}/${deltaCount}. `;
        assistantText += text;
        send({ type: 'text', text });
      }
      return { assistantText, stopReason: 'end_turn' };
    },

    async generateChatTitle() {
      return 'Loadtest stub session';
    },

    async generateChatFollowups() {
      return ['Stub follow-up one?', 'Stub follow-up two?'];
    },

    async generateChatSummary() {
      return null;
    },
  };
}
