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
  socialSignalsPath,
} from '../../../../business_modules/resilience/domain/services/pipelineArtifactPaths.js';

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
