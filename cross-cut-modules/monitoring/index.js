/**
 * Technical monitoring — pipeline artifacts, cost-log telemetry, health checks.
 * Domain resilience monitoring (scores, attention) stays in business_modules/resilience.
 *
 * v2: replace noop metricsPort / tracePort with OpenTelemetry adapters.
 */

export { createNoopMetricsPort, noopMetricsPort } from './domain/ports/IMetricsPort.js';
export { createNoopTracePort, noopTracePort } from './domain/ports/ITracePort.js';
export { buildPipelineStageDefinitions } from './domain/pipelineStageCatalog.js';
export { createPipelineStatusService } from './app/pipelineStatusService.js';
export { createHealthService } from './app/healthService.js';
export { createMonitoringService } from './app/monitoringService.js';
export { registerMonitoringRoutes } from './input/monitoringRoutes.js';
