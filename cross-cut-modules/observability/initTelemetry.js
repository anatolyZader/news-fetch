/**
 * Initialize OpenTelemetry SDK when OTEL_ENABLED=true.
 */
let started = false;

export async function initTelemetry() {
  if (started || process.env.OTEL_ENABLED !== 'true') return;
  started = true;
  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME || 'news',
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      }),
    });
    await sdk.start();
  } catch (err) {
    console.warn('[otel] init failed:', err?.message ?? err);
  }
}
