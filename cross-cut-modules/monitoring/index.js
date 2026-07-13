/**
 * Technical monitoring — pipeline artifacts, cost-log telemetry, health checks,
 * and telemetry backends. Domain resilience monitoring (scores, attention)
 * stays in business_modules/resilience.
 *
 * Default: in-process metrics. OTEL backend (spans + OTLP export) activates
 * when OTEL_ENABLED=true — see infrastructure/initTelemetry.js and
 * infrastructure/adapters/{withSpan,otelTracePort}.js.
 */

export { createNoopMetricsPort, noopMetricsPort } from './domain/ports/IMetricsPort.js';
export { createNoopTracePort, noopTracePort } from './domain/ports/ITracePort.js';
export { METRIC, durationMetricName } from './domain/metricNames.js';
export { createInProcessMetricsPort } from './infrastructure/adapters/inProcessMetricsPort.js';
export { createTracingMetricsPort } from './infrastructure/adapters/tracingMetricsPort.js';
export { createOtelTracePort } from './infrastructure/adapters/otelTracePort.js';
export { withSpan } from './infrastructure/adapters/withSpan.js';
export { initTelemetry } from './infrastructure/initTelemetry.js';
export { buildPipelineStageDefinitions } from './domain/pipelineStageCatalog.js';
export { createPipelineStatusService } from './app/pipelineStatusService.js';
export { createHealthService } from './app/healthService.js';
export { createMonitoringService } from './app/monitoringService.js';
export { registerMonitoringRoutes } from './input/monitoringRoutes.js';
