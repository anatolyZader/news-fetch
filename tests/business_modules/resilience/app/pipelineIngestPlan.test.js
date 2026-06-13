import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import {
  buildPipelineIngestPlan,
  parsePipelineDateArg,
  planHasWork,
} from '../../../../business_modules/resilience/app/pipelineIngestPlan.js';
import {
  newsArticlesPath,
  newsSignalsPath,
  pipelineOpenObservationsPath,
  socialSignalsPath,
} from '../../../../business_modules/resilience/domain/services/pipelineArtifactPaths.js';
import { openPipelineObsNeedsExtract } from '../../../../business_modules/resilience/app/pipelineOpenObsGuard.js';
import { pipelineObservationBundleFilename } from '../../../../business_modules/signals_extraction/domain/services/observationSchema.js';

describe('parsePipelineDateArg', () => {
  it('parses dd:mm:yyyy', () => {
    assert.equal(parsePipelineDateArg('15:04:2026'), '2026-04-15');
  });

  it('passes through YYYY-MM-DD', () => {
    assert.equal(parsePipelineDateArg('2026-05-23'), '2026-05-23');
  });

  it('returns null for invalid input', () => {
    assert.equal(parsePipelineDateArg('not-a-date'), null);
  });
});

describe('buildPipelineIngestPlan', () => {
  it('reuses existing news signals in replay mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-'));
    try {
      const date = '2026-04-15';
      const sigDir = join(root, 'business_modules/signals_extraction/data/signals');
      mkdirSync(sigDir, { recursive: true });
      writeFileSync(newsSignalsPath(date, root), '{"signals":[]}');
      const enabled = new Set(['news', 'pbo', 'field']);
      const plan = buildPipelineIngestPlan({
        targetDate: date,
        days: 3,
        enabledSources: enabled,
        replayMode: true,
        conservativeNewsFetch: true,
        rootDir: root,
      });
      const news = plan.steps.filter((s) => s.stage === 'news' && s.date === date);
      assert.ok(news.some((s) => s.action === 'reuse'));
      assert.ok(planHasWork(plan.steps));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('plans extract_open_only when closed signals exist but open obs are missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-open-'));
    const prev = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    try {
      const date = '2026-04-15';
      const sigDir = join(root, 'business_modules/signals_extraction/data/signals');
      mkdirSync(sigDir, { recursive: true });
      writeFileSync(newsSignalsPath(date, root), '{"signals":[]}');

      const mdPath = newsArticlesPath(date, root);
      mkdirSync(resolve(mdPath, '..'), { recursive: true });
      writeFileSync(mdPath, '# homefront articles');

      const plan = buildPipelineIngestPlan({
        targetDate: date,
        days: 1,
        enabledSources: new Set(['news']),
        replayMode: true,
        conservativeNewsFetch: true,
        rootDir: root,
      });

      const news = plan.steps.filter((s) => s.stage === 'news' && s.date === date);
      assert.ok(news.some((s) => s.action === 'reuse'));
      assert.ok(news.some((s) => s.action === 'extract_open_only'));
      assert.ok(!news.some((s) => s.action === 'extract_news'));
    } finally {
      if (prev == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
      else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prev;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reuses only when both closed and open obs exist with observations', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-open-'));
    const prev = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    try {
      const date = '2026-04-15';
      const sigDir = join(root, 'business_modules/signals_extraction/data/signals');
      const dataDir = join(root, 'business_modules/signals_extraction/data');
      mkdirSync(sigDir, { recursive: true });
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(newsSignalsPath(date, root), '{"signals":[]}');

      const mdPath = newsArticlesPath(date, root);
      mkdirSync(resolve(mdPath, '..'), { recursive: true });
      writeFileSync(mdPath, '# homefront articles');

      writeFileSync(
        join(dataDir, pipelineObservationBundleFilename('news', date)),
        JSON.stringify({ observations: [{ evidence: 'open obs', behavioral_description: 'x' }] }),
      );

      const plan = buildPipelineIngestPlan({
        targetDate: date,
        days: 1,
        enabledSources: new Set(['news']),
        replayMode: true,
        rootDir: root,
      });

      const news = plan.steps.filter((s) => s.stage === 'news' && s.date === date);
      assert.ok(news.some((s) => s.action === 'reuse'));
      assert.ok(!news.some((s) => s.action === 'extract_open_only'));
      assert.ok(!news.some((s) => s.action === 'extract_news'));
    } finally {
      if (prev == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
      else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prev;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('plans extract_open_only when open bundle has empty observations', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-open-'));
    const prev = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    try {
      const date = '2026-04-15';
      const sigDir = join(root, 'business_modules/signals_extraction/data/signals');
      const dataDir = join(root, 'business_modules/signals_extraction/data');
      mkdirSync(sigDir, { recursive: true });
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(newsSignalsPath(date, root), '{"signals":[]}');
      writeFileSync(
        join(dataDir, pipelineObservationBundleFilename('news', date)),
        JSON.stringify({ observations: [] }),
      );

      const mdPath = newsArticlesPath(date, root);
      mkdirSync(resolve(mdPath, '..'), { recursive: true });
      writeFileSync(mdPath, '# homefront articles');

      const plan = buildPipelineIngestPlan({
        targetDate: date,
        days: 1,
        enabledSources: new Set(['news']),
        replayMode: true,
        rootDir: root,
      });

      const news = plan.steps.filter((s) => s.stage === 'news' && s.date === date);
      assert.ok(news.some((s) => s.action === 'extract_open_only'));
    } finally {
      if (prev == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
      else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prev;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('plans fetch+extract for national today when news signals missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-'));
    try {
      const date = '2026-06-10';
      const enabled = new Set(['news']);
      const plan = buildPipelineIngestPlan({
        targetDate: date,
        days: 1,
        enabledSources: enabled,
        replayMode: false,
        conservativeNewsFetch: false,
        rootDir: root,
      });
      const news = plan.steps.filter((s) => s.stage === 'news' && s.date === date);
      assert.ok(news.some((s) => s.action === 'fetch_news'));
      assert.ok(news.some((s) => s.action === 'extract_news'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('force plans full extract_news not open-only when closed signals exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-force-'));
    const prev = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    try {
      const date = '2026-04-15';
      const sigDir = join(root, 'business_modules/signals_extraction/data/signals');
      mkdirSync(sigDir, { recursive: true });
      writeFileSync(newsSignalsPath(date, root), '{"signals":[]}');

      const mdPath = newsArticlesPath(date, root);
      mkdirSync(resolve(mdPath, '..'), { recursive: true });
      writeFileSync(mdPath, '# homefront articles');

      const plan = buildPipelineIngestPlan({
        targetDate: date,
        days: 1,
        enabledSources: new Set(['news']),
        replayMode: true,
        force: true,
        rootDir: root,
      });

      const news = plan.steps.filter((s) => s.stage === 'news' && s.date === date);
      assert.ok(news.some((s) => s.action === 'extract_news'));
      assert.ok(!news.some((s) => s.action === 'reuse'));
      assert.ok(!news.some((s) => s.action === 'extract_open_only'));
    } finally {
      if (prev == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
      else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prev;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('conservative north mode skips fetch when articles md exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-'));
    try {
      const date = '2026-06-10';
      const mdPath = newsArticlesPath(date, root);
      mkdirSync(resolve(mdPath, '..'), { recursive: true });
      writeFileSync(mdPath, '# articles');
      const enabled = new Set(['news']);
      const plan = buildPipelineIngestPlan({
        targetDate: date,
        days: 1,
        enabledSources: enabled,
        replayMode: false,
        conservativeNewsFetch: true,
        rootDir: root,
      });
      const news = plan.steps.filter((s) => s.stage === 'news' && s.date === date);
      assert.ok(!news.some((s) => s.action === 'fetch_news'));
      assert.ok(news.some((s) => s.action === 'extract_news'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reuses social bundles in replay when files exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-'));
    try {
      const date = '2026-05-23';
      const socialDir = join(root, 'business_modules/social_media/data');
      mkdirSync(socialDir, { recursive: true });
      writeFileSync(socialSignalsPath(date, root), '{"findings":[{}],"signals":[]}');
      const enabled = new Set(['social']);
      const plan = buildPipelineIngestPlan({
        targetDate: date,
        days: 1,
        enabledSources: enabled,
        replayMode: true,
        rootDir: root,
      });
      assert.ok(plan.steps.some((s) => s.stage === 'social' && s.action === 'reuse'));
      assert.ok(!plan.steps.some((s) => s.action === 'social_gather'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('plans extract_open_social when social closed bundle exists but open obs missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-social-'));
    const prev = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    try {
      const date = '2026-05-23';
      const socialDir = join(root, 'business_modules/social_media/data');
      mkdirSync(socialDir, { recursive: true });
      writeFileSync(socialSignalsPath(date, root), JSON.stringify({
        findings: [{ quote_original: 'test quote', platform: 'telegram' }],
      }));

      const plan = buildPipelineIngestPlan({
        targetDate: date,
        days: 1,
        enabledSources: new Set(['social']),
        replayMode: true,
        rootDir: root,
      });

      assert.ok(plan.steps.some((s) => s.action === 'reuse'));
      assert.ok(plan.steps.some((s) => s.action === 'extract_open_social'));
      assert.equal(
        openPipelineObsNeedsExtract(pipelineOpenObservationsPath('social', date, root)),
        true,
      );
    } finally {
      if (prev == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
      else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prev;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips field/pbo extraction in replay mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-'));
    try {
      const enabled = new Set(['field', 'pbo', 'naftali']);
      const plan = buildPipelineIngestPlan({
        targetDate: '2026-04-15',
        days: 3,
        enabledSources: enabled,
        replayMode: true,
        rootDir: root,
      });
      assert.ok(!plan.steps.some((s) => s.action === 'extract_field'));
      assert.ok(!plan.steps.some((s) => s.action === 'extract_pbo'));
      assert.ok(!plan.steps.some((s) => s.action === 'extract_naftali'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
