import { DatabaseSync } from 'node:sqlite';

import { createNoopMetricsPort } from '../domain/ports/IMetricsPort.js';
import { createNoopTracePort } from '../domain/ports/ITracePort.js';
import { METRIC } from '../domain/metricNames.js';
import { createPipelineStatusService } from './pipelineStatusService.js';
import { createHealthService } from './healthService.js';
import {
  readCostForDate,
  readStageTelemetryForDate,
  resolveCostLogPath,
  summarizeStageDropRates,
} from '../infrastructure/adapters/costLogReader.js';
import {
  readLlmInvocationRowsForDate,
  readLlmTelemetryForDate,
} from '../../llm/llmInvocationLog.js';

/**
 * Real liveness ping: lazily opens a read-only connection and runs SELECT 1.
 * On failure the connection is dropped so the next call reopens once.
 *
 * @param {string} sqlitePath
 * @returns {() => boolean}
 */
function createSqlitePing(sqlitePath) {
  /** @type {import('node:sqlite').DatabaseSync | null} */
  let db = null;
  return () => {
    try {
      if (!db) {
        db = new DatabaseSync(sqlitePath, { readOnly: true });
      }
      db.prepare('SELECT 1').get();
      return true;
    } catch {
      try { db?.close(); } catch { /* already closed */ }
      db = null;
      return false;
    }
  };
}

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
 *   getLoopDelayMs?: (() => number) | null,
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
    sqlitePing: deps.sqlitePath ? createSqlitePing(deps.sqlitePath) : null,
    getLoopDelayMs: deps.getLoopDelayMs ?? null,
  });

  async function getPipelineStatus(opts = {}) {
    return tracePort.startActiveSpan(METRIC.MONITORING_GET_PIPELINE_STATUS, () => {
      metricsPort.increment('monitoring.pipeline.requests');
      return pipelineStatus.getStatus(opts);
    });
  }

  async function getHealth() {
    return tracePort.startActiveSpan(METRIC.MONITORING_GET_HEALTH, () => {
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

  async function getLlmTelemetry({ date } = {}) {
    const datePrefix = date ?? new Date().toISOString().slice(0, 10);
    return readLlmTelemetryForDate(datePrefix, deps.rootDir);
  }

  async function getStageTelemetry({ date } = {}) {
    const logPath = resolveCostLogPath(deps.rootDir);
    const byScript = readStageTelemetryForDate(logPath, date, {
      scripts: ['extract-signals', 'assess-signals'],
    });
    return summarizeStageDropRates(byScript);
  }

  function metricsSnapshot() {
    if (typeof metricsPort.snapshot === 'function') {
      return metricsPort.snapshot();
    }
    return null;
  }

  function metricsPortKind() {
    return typeof metricsPort.snapshot === 'function' ? 'in_process' : 'noop';
  }

  async function getSummary({ date, scope = 'national' } = {}) {
    return tracePort.startActiveSpan(METRIC.MONITORING_GET_SUMMARY, async (span) => {
      span.setAttribute('monitoring.scope', scope);
      if (date) span.setAttribute('monitoring.date', date);

      const pipeline = await getPipelineStatus({ date, scope });
      const healthResult = await getHealth();
      const cost = await getCostTelemetry({ date: pipeline.date });
      const stage_telemetry = await getStageTelemetry({ date: pipeline.date });

      metricsPort.gauge('monitoring.pipeline.overall', pipeline.overall === 'complete' ? 1 : 0);

      const latency = metricsSnapshot();
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
        metrics_port: metricsPortKind(),
        trace_port: metricsPortKind(),
        ...(latency ? { latency } : {}),
      };
    });
  }

  async function getAgentTelemetry({ date } = {}) {
    const datePrefix = date ?? new Date().toISOString().slice(0, 10);
    const rows = readLlmInvocationRowsForDate(datePrefix, deps.rootDir);

    const byFeature = {};
    const inc = (feature, key, value = 1) => {
      if (!byFeature[feature]) byFeature[feature] = {};
      byFeature[feature][key] = (byFeature[feature][key] ?? 0) + value;
    };

    for (const row of rows) {
      if (!row.timestamp?.startsWith(datePrefix)) continue;

      const feature = String(row.feature ?? 'unknown');
      const stopReason = row.stopReason ?? null;
      const costUsd = typeof row.costUsd === 'number' ? row.costUsd : 0;

      inc(feature, 'total_usd', costUsd);
      inc(feature, 'invocation_count', 1);

      if (stopReason != null) {
        const stopKey = `stop_${String(stopReason)}`;
        inc(feature, stopKey, 1);
      }

      if (stopReason === 'max_rounds') inc(feature, 'loop_hits', 1);
    }

    // Post-process into a stable shape.
    const normalized = Object.fromEntries(
      Object.entries(byFeature).map(([feature, s]) => {
        const toolUse = s.stop_tool_use ?? 0;
        const endTurn = s.stop_end_turn ?? 0;
        const totalToolOrEnd = toolUse + endTurn;
        const tool_call_success_ratio = totalToolOrEnd > 0
          ? toolUse / totalToolOrEnd
          : null;

        return [
          feature,
          {
            total_usd: Math.round((s.total_usd ?? 0) * 1e6) / 1e6,
            invocation_count: s.invocation_count ?? 0,
            $per_invocation: s.invocation_count > 0
              ? Math.round(((s.total_usd ?? 0) / s.invocation_count) * 1e6) / 1e6
              : null,
            tool_call_success_ratio,
            loop_hits: s.loop_hits ?? 0,
            stop_counts: Object.fromEntries(
              Object.entries(s)
                .filter(([k]) => k.startsWith('stop_'))
                .map(([k, v]) => [k.slice('stop_'.length), v]),
            ),
          },
        ];
      }),
    );

    return {
      date: datePrefix,
      by_feature: normalized,
    };
  }

  return {
    getSummary,
    getHealth,
    getPublicHealth,
    getPipelineStatus,
    getCostTelemetry,
    getLlmTelemetry,
    getStageTelemetry,
    getAgentTelemetry,
  };
}
