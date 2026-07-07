import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createMonitoringService } from '../../../cross-cut-modules/monitoring/app/monitoringService.js';
import { createHealthService } from '../../../cross-cut-modules/monitoring/app/healthService.js';
import { createInProcessMetricsPort } from '../../../cross-cut-modules/monitoring/infrastructure/adapters/inProcessMetricsPort.js';
import { createTracingMetricsPort } from '../../../cross-cut-modules/monitoring/infrastructure/adapters/tracingMetricsPort.js';
import { summarizeStageDropRates } from '../../../cross-cut-modules/monitoring/infrastructure/adapters/costLogReader.js';

describe('monitoringService', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = join(tmpdir(), `monitoring-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.COST_LOG_PATH = join(rootDir, 'cost-log.jsonl');
    mkdirSync(join(rootDir, 'business_modules/signals_extraction/data/signals'), { recursive: true });
    mkdirSync(join(rootDir, 'business_modules/resilience_scorer/data/daily_reports'), { recursive: true });
    mkdirSync(join(rootDir, 'db'), { recursive: true });
    mkdirSync(join(rootDir, 'business_modules/news-sites/articles_extracted'), { recursive: true });

    writeFileSync(join(rootDir, 'pipeline-config.json'), JSON.stringify({
      sources: { news: { enabled: true } },
    }));
    writeFileSync(join(rootDir, 'db/app.sqlite'), '');
    writeFileSync(join(rootDir, 'business_modules/signals_extraction/data/signals/signals-news-2026-05-27.json'), JSON.stringify({
      date: '2026-05-27',
      total_articles: 5,
      signals: [],
    }));
    writeFileSync(join(rootDir, 'business_modules/resilience_scorer/data/daily_reports/resilience-report-2026-05-27.json'), JSON.stringify({
      generated_at: '2026-05-27T10:00:00.000Z',
      assessment: { date: '2026-05-27', total_articles_analyzed: 5 },
      signals: [],
    }));
    writeFileSync(join(rootDir, 'cost-log.jsonl'), JSON.stringify({
      date: '2026-05-27',
      script: 'extract-signals',
      totalCostUsd: 0.5,
      stages: {
        perStage: {
          evidence_verifier: { kept: 8, dropped: 2, input: 10 },
        },
        totals: { kept: 8, dropped: 2, input: 10 },
      },
    }));
  });

  afterEach(() => {
    delete process.env.COST_LOG_PATH;
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('getSummary bundles pipeline, health, cost, and stage telemetry', async () => {
    const svc = createMonitoringService({
      rootDir,
      sqlitePath: join(rootDir, 'db/app.sqlite'),
      timezone: 'Asia/Jerusalem',
    });
    const summary = await svc.getSummary({ date: '2026-05-27', scope: 'national' });

    assert.equal(summary.date, '2026-05-27');
    assert.equal(summary.metrics_port, 'noop');
    assert.equal(summary.health.status, 'ok');
    assert.equal(summary.pipeline.overall, 'complete');
    assert.equal(summary.cost.by_script['extract-signals'], 0.5);
    assert.equal(summary.stage_telemetry.totals.dropped, 2);
    assert.equal(summary.stage_telemetry.per_stage.evidence_verifier.dropped, 2);
  });

  it('getSummary includes latency snapshot with in-process metrics', async () => {
    const metricsPort = createInProcessMetricsPort();
    const tracePort = createTracingMetricsPort({ metricsPort });
    metricsPort.histogram('chat.request.duration_ms', 42);

    const svc = createMonitoringService({
      rootDir,
      sqlitePath: join(rootDir, 'db/app.sqlite'),
      timezone: 'Asia/Jerusalem',
      metricsPort,
      tracePort,
    });
    const summary = await svc.getSummary({ date: '2026-05-27', scope: 'national' });

    assert.equal(summary.metrics_port, 'in_process');
    assert.ok(summary.latency);
    assert.equal(summary.latency['chat.request.duration_ms'].count, 1);
  });
});

describe('healthService', () => {
  it('returns degraded when reports dir missing', () => {
    const rootDir = join(tmpdir(), `health-${Date.now()}`);
    mkdirSync(join(rootDir, 'db'), { recursive: true });
    writeFileSync(join(rootDir, 'db/app.sqlite'), '');

    const svc = createHealthService({
      rootDir,
      sqlitePath: join(rootDir, 'db/app.sqlite'),
    });
    const health = svc.getHealth();
    assert.equal(health.status, 'degraded');
    assert.equal(health.checks.sqlite.ok, true);
    assert.equal(health.checks.reports_dir.ok, false);

    rmSync(rootDir, { recursive: true, force: true });
  });
});

describe('summarizeStageDropRates', () => {
  it('aggregates perStage across scripts', () => {
    const out = summarizeStageDropRates({
      'extract-signals': {
        perStage: { verify: { kept: 3, dropped: 1, input: 4 } },
      },
      'assess-signals': {
        perStage: { verify: { kept: 2, dropped: 1, input: 3 } },
      },
    });
    assert.equal(out.totals.dropped, 2);
    assert.equal(out.per_stage.verify.dropped, 2);
  });
});
