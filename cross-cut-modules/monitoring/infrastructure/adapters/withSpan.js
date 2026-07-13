/**
 * Lightweight span helper; uses OpenTelemetry when OTEL_ENABLED=true.
 */

let api = null;

async function loadApi() {
  if (api) return api;
  if (process.env.OTEL_ENABLED !== 'true') return null;
  try {
    api = await import('@opentelemetry/api');
    return api;
  } catch {
    return null;
  }
}

/**
 * @template T
 * @param {string} name
 * @param {Record<string, string|number|boolean>} [attributes]
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withSpan(name, attributes, fn) {
  const otel = await loadApi();
  if (!otel?.trace) {
    return fn();
  }
  const tracer = otel.trace.getTracer(process.env.OTEL_SERVICE_NAME || 'news');
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn();
      span.end();
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: otel.SpanStatusCode.ERROR, message: err?.message });
      span.end();
      throw err;
    }
  });
}
