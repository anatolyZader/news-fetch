import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createPipelineStatusService } from '../../../cross-cut-modules/monitoring/app/pipelineStatusService.js';

describe('pipelineStatusService', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = join(tmpdir(), `pipeline-status-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.COST_LOG_PATH = join(rootDir, 'cost-log.jsonl');
    mkdirSync(join(rootDir, 'business_modules/signals_extraction/data/signals'), { recursive: true });
    mkdirSync(join(rootDir, 'business_modules/resilience_scorer/data/reports'), { recursive: true });
    mkdirSync(join(rootDir, 'business_modules/news-sites/articles_extracted'), { recursive: true });

    writeFileSync(join(rootDir, 'pipeline-config.json'), JSON.stringify({
      sources: {
        news: { enabled: true },
        whatsapp: { enabled: false },
        social: { enabled: false },
        radio: { enabled: false },
        field: { enabled: false },
        pbo: { enabled: false },
        naftali: { enabled: false },
      },
    }));

    writeFileSync(
      join(rootDir, 'business_modules/news-sites/articles_extracted/articles-homefront-2026-05-27.md'),
      '# test',
    );
    writeFileSync(join(rootDir, 'business_modules/signals_extraction/data/signals/signals-news-2026-05-27.json'), JSON.stringify({
      date: '2026-05-27',
      total_articles: 10,
      extracted_at: '2026-05-27T08:00:00.000Z',
      signals: [],
    }));
    writeFileSync(join(rootDir, 'business_modules/resilience_scorer/data/reports/resilience-report-2026-05-27.json'), JSON.stringify({
      generated_at: '2026-05-27T09:00:00.000Z',
      assessment: { date: '2026-05-27', total_articles_analyzed: 10 },
      signals: [],
    }));
    writeFileSync(join(rootDir, 'cost-log.jsonl'), [
      JSON.stringify({ date: '2026-05-27', script: 'extract-signals', totalCostUsd: 0.12 }),
      JSON.stringify({ date: '2026-05-27', script: 'assess-signals', totalCostUsd: 0.34 }),
    ].join('\n'));
  });

  afterEach(() => {
    delete process.env.COST_LOG_PATH;
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('reports complete status when enabled stages and assess exist', () => {
    const svc = createPipelineStatusService({ rootDir, timezone: 'Asia/Jerusalem' });
    const status = svc.getStatus({ date: '2026-05-27', scope: 'national' });

    assert.equal(status.overall, 'complete');
    assert.equal(status.report_served.found, true);
    assert.ok(status.stages.find((s) => s.id === 'signals_news')?.status === 'ok');
    assert.ok(status.stages.find((s) => s.id === 'signals_whatsapp')?.status === 'disabled');
    assert.equal(status.cost.by_script['extract-signals'], 0.12);
    assert.equal(status.cost.by_script['assess-signals'], 0.34);
  });

  it('reports missing when assess report absent', () => {
    rmSync(join(rootDir, 'business_modules/resilience_scorer/data/reports/resilience-report-2026-05-27.json'));
    const svc = createPipelineStatusService({ rootDir, timezone: 'Asia/Jerusalem' });
    const status = svc.getStatus({ date: '2026-05-27', scope: 'national' });
    assert.equal(status.overall, 'partial');
    assert.equal(status.report_served.found, false);
    assert.equal(status.stages.find((s) => s.id === 'assess')?.status, 'missing');
  });
});
