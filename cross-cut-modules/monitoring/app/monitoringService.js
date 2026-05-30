import { createNoopMetricsPort } from '../domain/ports/IMetricsPort.js';
import { createNoopTracePort } from '../domain/ports/ITracePort.js';
import { createPipelineStatusService } from './pipelineStatusService.js';
import { createHealthService } from './healthService.js';
import {
  readCostForDate,
  readStageTelemetryForDate,
  resolveCostLogPath,
  summarizeStageDropRates,
} from '../infrastructure/adapters/costLogReader.js';

/**
 * Technical monitoring facade (filesystem + cost-log v1).
 * Inject metricsPort / tracePort for OpenTelemetry in v2.
 *
 * @param {{
 *   rootDir: string,
 *   timezone?: string,
 *   sqlitePath?: string | null,
 *   metricsPort?: object,
 *   tracePort?: object,
 * }} deps
 */
export function createMonitoringService(deps) {
  const metricsPort = deps.metricsPort ?? createNoopMetricsPort();
  const tracePort = deps.tracePort ?? createNoopTracePort();
  const pipelineStatus = createPipelineStatusService({
    rootDir: deps.rootDir,
    timezone: deps.timezone,
  });
  const health = createHealthService({
    rootDir: deps.rootDir,
    sqlitePath: deps.sqlitePath,
  });

  async function getPipelineStatus(opts = {}) {
    return tracePort.startActiveSpan('monitoring.getPipelineStatus', () => {
      metricsPort.increment('monitoring.pipeline.requests');
      return pipelineStatus.getStatus(opts);
    });
  }

  async function getHealth() {
    return tracePort.startActiveSpan('monitoring.getHealth', () => {
      metricsPort.increment('monitoring.health.requests');
      return health.getHealth();
    });
  }

  async function getPublicHealth() {
    return tracePort.startActiveSpan('monitoring.getPublicHealth', () => {
      metricsPort.increment('monitoring.health.public_requests');
      return health.getPublicHealth();
    });
  }

  async function getCostTelemetry({ date } = {}) {
    const logPath = resolveCostLogPath(deps.rootDir);
    const cost = readCostForDate(logPath, date);
    return {
      total_usd: cost.total_usd,
      by_script: cost.by_script,
    };
  }

  async function getStageTelemetry({ date } = {}) {
    const logPath = resolveCostLogPath(deps.rootDir);
    const byScript = readStageTelemetryForDate(logPath, date, {
      scripts: ['extract-signals', 'assess-signals'],
    });
    return summarizeStageDropRates(byScript);
  }

  async function getSummary({ date, scope = 'national' } = {}) {
    return tracePort.startActiveSpan('monitoring.getSummary', async (span) => {
      span.setAttribute('monitoring.scope', scope);
      if (date) span.setAttribute('monitoring.date', date);

      const pipeline = await getPipelineStatus({ date, scope });
      const healthResult = await getHealth();
      const cost = await getCostTelemetry({ date: pipeline.date });
      const stage_telemetry = await getStageTelemetry({ date: pipeline.date });

      metricsPort.gauge('monitoring.pipeline.overall', pipeline.overall === 'complete' ? 1 : 0);

      return {
        date: pipeline.date,
        scope: pipeline.scope,
        today_in_tz: pipeline.today_in_tz,
        is_stale: pipeline.is_stale,
        health: healthResult,
        pipeline: {
          overall: pipeline.overall,
          stages: pipeline.stages,
          report_served: pipeline.report_served,
        },
        cost,
        stage_telemetry,
        metrics_port: 'noop',
        trace_port: 'noop',
      };
    });
  }

  return {
    getSummary,
    getHealth,
    getPublicHealth,
    getPipelineStatus,
    getCostTelemetry,
    getStageTelemetry,
  };
}
