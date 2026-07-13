/**
 * ITracePort adapter that wraps an inner trace port with an OpenTelemetry span
 * (the "OTEL in v2" completion). When OTEL_ENABLED is not 'true', withSpan is a
 * passthrough, so composing this adapter is behavior-neutral.
 *
 * Span attributes set via span.setAttribute flow to the inner port (metrics
 * labels); the OTEL span carries the name and wall time.
 */
import { withSpan } from './withSpan.js';

/**
 * @param {{ inner: { startActiveSpan: (name: string, fn: Function) => any } }} deps
 */
export function createOtelTracePort(deps) {
  const inner = deps.inner;
  return {
    /**
     * @template T
     * @param {string} name
     * @param {(span: { setAttribute: (k: string, v: string|number|boolean) => void }) => T | Promise<T>} fn
     * @returns {Promise<T>}
     */
    async startActiveSpan(name, fn) {
      return withSpan(name, {}, () => inner.startActiveSpan(name, fn));
    },
  };
}
