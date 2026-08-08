import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import {
  buildPipelineIngestPlan,
  parsePipelineDateArg,
  planHasWork,
} from '../../../../business_modules/resilience_scorer/app/pipeline/pipelineIngestPlan.js';
import {
  newsArticlesPath,
  newsSignalsPath,
  pboSignalsPath,
  pipelineOpenObservationsPath,
  socialSignalsPath,
  fieldSignalsPath,
} from '../../../../business_modules/resilience_scorer/domain/services/paths/ingestPaths.js';
import { openPipelineObsNeedsExtract } from '../../../../business_modules/resilience_scorer/app/pipeline/pipelineOpenObsGuard.js';
import { pipelineObservationBundleFilename } from '../../../../business_modules/open_observation_extraction/domain/services/observationSchema.js';

const REPLAY_REUSE_ENV_KEYS = [
  'RESILIENCE_REPLAY_REUSE_NEWS',
  'RESILIENCE_REPLAY_REUSE_RADIO',
  'RESILIENCE_REPLAY_REUSE_WHATSAPP',
  'RESILIENCE_REPLAY_REUSE_VISITS',
  'RESILIENCE_REPLAY_REUSE_PBO',
  'RESILIENCE_REPLAY_REUSE_NAFTALI',
  'RESILIENCE_REPLAY_REUSE_SOCIAL',
  'RESILIENCE_REPLAY_REUSE_PBO_REGIONAL',
];

function snapshotReplayReuseEnv() {
  return Object.fromEntries(REPLAY_REUSE_ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restoreReplayReuseEnv(snapshot) {
  for (const key of REPLAY_REUSE_ENV_KEYS) {
    if (snapshot[key] == null) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function withReplayReuseEnv(overrides, fn) {
  const snapshot = snapshotReplayReuseEnv();
  for (const key of REPLAY_REUSE_ENV_KEYS) delete process.env[key];
  Object.assign(process.env, overrides);
  try {
    return fn();
  } finally {
    restoreReplayReuseEnv(snapshot);
  }
}

function seedVisits(root, dates, { withBundles = true } = {}) {
  const visitsDir = join(root, 'business_modules/visits/data');
  mkdirSync(join(visitsDir, 'signals'), { recursive: true });
  for (const d of dates) {
    writeFileSync(join(visitsDir, `articles-visits-reports-${d}.md`), '# visit');
    if (withBundles) writeFileSync(fieldSignalsPath(d, root), '{"signals":[]}');
  }
}

function withVisitsReextractHold(value, fn) {
  const key = 'RESILIENCE_VISITS_REEXTRACT_HOLD';
  const prev = process.env[key];
  if (value == null) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prev == null) delete process.env[key];
    else process.env[key] = prev;
  }
}

describe('parsePipelineDateArg', () => {
  it('parses dd:mm:yyyy', () => {
    assert.equal(parsePipelineDateArg('15:04:2026'), '2026-04-15');
  });

  it('passes through YYYY-MM-DD', () => {
    assert.equal(parsePipelineDateArg('2026-05-23'), '2026-05-23');
  });

  it('parses dd/mm/yyyy', () => {
    assert.equal(parsePipelineDateArg('15/04/2026'), '2026-04-15');
  });

  it('returns null for invalid input', () => {
    assert.equal(parsePipelineDateArg('not-a-date'), null);
  });
});

describe('buildPipelineIngestPlan', () => {
  it('reuses existing news signals in replay mode', () => {
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_NEWS: '1' }, () => {
      const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-'));
      try {
        const date = '2026-04-15';
        const sigDir = join(root, 'business_modules/resilience_scorer/data/signals');
        mkdirSync(sigDir, { recursive: true });
        writeFileSync(newsSignalsPath(date, root), '{"signals":[]}');
        const enabled = new Set(['news', 'pbo', 'visits']);
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
  });

  it('plans extract_open_only when closed signals exist but open obs are missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-open-'));
    const prevParallel = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    const prevLegacy = process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = '1';
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_NEWS: '1' }, () => {
      try {
        const date = '2026-04-15';
        const sigDir = join(root, 'business_modules/resilience_scorer/data/signals');
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
        if (prevParallel == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
        else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prevParallel;
        if (prevLegacy == null) delete process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
        else process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = prevLegacy;
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('reuses only when both closed and open obs exist with observations', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-open-'));
    const prevParallel = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    const prevLegacy = process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = '1';
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_NEWS: '1' }, () => {
      try {
        const date = '2026-04-15';
        const sigDir = join(root, 'business_modules/resilience_scorer/data/signals');
        const dataDir = join(root, 'business_modules/open_observation_extraction/data');
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
        if (prevParallel == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
        else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prevParallel;
        if (prevLegacy == null) delete process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
        else process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = prevLegacy;
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('plans extract_open_only when open bundle has empty observations', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-open-'));
    const prevParallel = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    const prevLegacy = process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = '1';
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_NEWS: '1' }, () => {
      try {
        const date = '2026-04-15';
        const sigDir = join(root, 'business_modules/resilience_scorer/data/signals');
        const dataDir = join(root, 'business_modules/open_observation_extraction/data');
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
        if (prevParallel == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
        else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prevParallel;
        if (prevLegacy == null) delete process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
        else process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = prevLegacy;
        rmSync(root, { recursive: true, force: true });
      }
    });
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
    const prevParallel = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    const prevLegacy = process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = '1';
    try {
      const date = '2026-04-15';
      const sigDir = join(root, 'business_modules/resilience_scorer/data/signals');
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
      if (prevParallel == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
      else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prevParallel;
      if (prevLegacy == null) delete process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
      else process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = prevLegacy;
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
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_SOCIAL: '1' }, () => {
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
  });

  it('plans extract_open_social when social closed bundle exists but open obs missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-social-'));
    const prevParallel = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    const prevLegacy = process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = '1';
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_SOCIAL: '1' }, () => {
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
        if (prevParallel == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
        else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prevParallel;
        if (prevLegacy == null) delete process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
        else process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = prevLegacy;
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('skips visits and naftali extraction in replay mode when reuse enabled', () => {
    withReplayReuseEnv({
      RESILIENCE_REPLAY_REUSE_VISITS: '1',
      RESILIENCE_REPLAY_REUSE_NAFTALI: '1',
    }, () => {
      const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-'));
      try {
        const enabled = new Set(['visits', 'pbo', 'naftali']);
        const plan = buildPipelineIngestPlan({
          targetDate: '2026-04-15',
          days: 3,
          enabledSources: enabled,
          replayMode: true,
          rootDir: root,
        });
        assert.ok(!plan.steps.some((s) => s.action === 'extract_visits'));
        assert.ok(!plan.steps.some((s) => s.action === 'extract_naftali'));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('plans extract_pbo_date in replay when closed PBO exists but open obs missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-pbo-'));
    const prevParallel = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    const prevLegacy = process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = '1';
    try {
      const dates = ['2026-04-13', '2026-04-14', '2026-04-15'];
      const sigDir = join(root, 'business_modules/resilience_scorer/data/signals');
      mkdirSync(sigDir, { recursive: true });
      for (const date of dates) {
        writeFileSync(pboSignalsPath(date, root), JSON.stringify({ extractor_contract: 'pbo_llm_field_report', extractor_contract_version: 1, signals: [{ id: 's1' }] }));
      }

      const plan = buildPipelineIngestPlan({
        targetDate: '2026-04-15',
        days: 3,
        enabledSources: new Set(['pbo']),
        replayMode: true,
        rootDir: root,
      });

      for (const date of dates) {
        const pbo = plan.steps.filter((s) => s.stage === 'pbo' && s.date === date);
        assert.ok(pbo.some((s) => s.action === 'extract_pbo_date'), `expected extract_pbo_date for ${date}`);
      }
      assert.ok(!plan.steps.some((s) => s.action === 'extract_pbo'));
    } finally {
      if (prevParallel == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
      else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prevParallel;
      if (prevLegacy == null) delete process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
      else process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = prevLegacy;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reuses PBO in replay when both closed and open obs exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-pbo-'));
    const prevParallel = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    const prevLegacy = process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = '1';
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_PBO: '1' }, () => {
      try {
        const date = '2026-04-15';
        const sigDir = join(root, 'business_modules/resilience_scorer/data/signals');
        const dataDir = join(root, 'business_modules/open_observation_extraction/data');
        mkdirSync(sigDir, { recursive: true });
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(pboSignalsPath(date, root), JSON.stringify({ extractor_contract: 'pbo_llm_field_report', extractor_contract_version: 1, signals: [{ id: 's1' }] }));
        writeFileSync(
          pipelineOpenObservationsPath('pbo', date, root),
          JSON.stringify({ observations: [{ evidence: 'open pbo obs', behavioral_description: 'x' }] }),
        );

        const plan = buildPipelineIngestPlan({
          targetDate: date,
          days: 1,
          enabledSources: new Set(['pbo']),
          replayMode: true,
          rootDir: root,
        });

        const pbo = plan.steps.filter((s) => s.stage === 'pbo' && s.date === date);
        assert.ok(pbo.some((s) => s.action === 'reuse'));
        assert.ok(!pbo.some((s) => s.action === 'extract_pbo_date'));
      } finally {
        if (prevParallel == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
        else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prevParallel;
        if (prevLegacy == null) delete process.env.RESILIENCE_OPEN_PIPELINE_LEGACY;
        else process.env.RESILIENCE_OPEN_PIPELINE_LEGACY = prevLegacy;
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('plans per-date extract_pbo_date in today mode, not undated extract_pbo', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-pbo-'));
    try {
      const plan = buildPipelineIngestPlan({
        targetDate: '2026-04-15',
        days: 3,
        enabledSources: new Set(['pbo']),
        replayMode: false,
        rootDir: root,
      });

      assert.ok(!plan.steps.some((s) => s.action === 'extract_pbo'));
      assert.equal(
        plan.steps.filter((s) => s.stage === 'pbo' && s.action === 'extract_pbo_date').length,
        3,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('dev replay default: extract_news when signals and MD exist (no reuse)', () => {
    withReplayReuseEnv({}, () => {
      const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-dev-'));
      try {
        const date = '2026-04-15';
        const sigDir = join(root, 'business_modules/resilience_scorer/data/signals');
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
        assert.ok(news.some((s) => s.action === 'extract_news'));
        assert.ok(!news.some((s) => s.action === 'reuse'));
        assert.ok(!news.some((s) => s.action === 'extract_open_only'));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('dev replay default: extract_visits when MD and signals exist', () => {
    withReplayReuseEnv({}, () => {
      const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-dev-field-'));
      try {
        const date = '2026-03-24';
        const visitsDir = join(root, 'business_modules/visits/data');
        const sigDir = join(visitsDir, 'signals');
        mkdirSync(sigDir, { recursive: true });
        writeFileSync(
          join(visitsDir, `articles-visits-reports-${date}.md`),
          '# field report',
        );
        writeFileSync(fieldSignalsPath(date, root), '{"signals":[]}');

        const plan = buildPipelineIngestPlan({
          targetDate: '2026-04-15',
          days: 1,
          enabledSources: new Set(['visits']),
          replayMode: true,
          rootDir: root,
        });

        assert.ok(plan.steps.some((s) => s.action === 'extract_visits'));
        assert.ok(!plan.steps.some((s) => s.action === 'reuse' && s.stage === 'visits'));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('dev replay default: extract_naftali when enabled', () => {
    withReplayReuseEnv({}, () => {
      const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-dev-naftali-'));
      try {
        const plan = buildPipelineIngestPlan({
          targetDate: '2026-04-15',
          days: 1,
          enabledSources: new Set(['naftali']),
          replayMode: true,
          rootDir: root,
        });
        assert.ok(plan.steps.some((s) => s.action === 'extract_naftali'));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('REUSE_NEWS=1 restores reuse in replay (regression guard)', () => {
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_NEWS: '1' }, () => {
      const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-reuse-regression-'));
      try {
        const date = '2026-04-15';
        const sigDir = join(root, 'business_modules/resilience_scorer/data/signals');
        mkdirSync(sigDir, { recursive: true });
        writeFileSync(newsSignalsPath(date, root), '{"signals":[]}');

        const plan = buildPipelineIngestPlan({
          targetDate: date,
          days: 1,
          enabledSources: new Set(['news']),
          replayMode: true,
          rootDir: root,
        });

        const news = plan.steps.filter((s) => s.stage === 'news' && s.date === date);
        assert.ok(news.some((s) => s.action === 'reuse'));
        assert.ok(!news.some((s) => s.action === 'extract_news'));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('national today refresh re-extracts when news bundle exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-refresh-'));
    try {
      const date = '2026-04-15';
      const sigDir = join(root, 'business_modules/resilience_scorer/data/signals');
      mkdirSync(sigDir, { recursive: true });
      writeFileSync(newsSignalsPath(date, root), '{"signals":[]}');
      const mdPath = newsArticlesPath(date, root);
      mkdirSync(resolve(mdPath, '..'), { recursive: true });
      writeFileSync(mdPath, '# articles');

      const plan = buildPipelineIngestPlan({
        targetDate: date,
        days: 1,
        enabledSources: new Set(['news']),
        replayMode: false,
        scope: 'national',
        rootDir: root,
      });

      assert.equal(plan.ingestPolicy, 'refresh');
      const news = plan.steps.filter((s) => s.stage === 'news' && s.date === date);
      assert.ok(news.some((s) => s.action === 'extract_news'));
      assert.ok(!news.some((s) => s.action === 'reuse'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('always-reextract plans all visit MDs not only last three when hold is lifted', () => {
    withVisitsReextractHold('0', () => {
      const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-visits-all-'));
      try {
        const visitsDir = join(root, 'business_modules/visits/data');
        mkdirSync(visitsDir, { recursive: true });
        for (const d of ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04']) {
          writeFileSync(join(visitsDir, `articles-visits-reports-${d}.md`), '# visit');
        }

        const plan = buildPipelineIngestPlan({
          targetDate: '2026-04-15',
          days: 1,
          enabledSources: new Set(['visits']),
          replayMode: false,
          alwaysReextract: true,
          scope: 'north',
          rootDir: root,
        });

        const extracts = plan.steps.filter((s) => s.action === 'extract_visits');
        assert.equal(extracts.length, 4);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe('visits re-extract hold (default)', () => {
    it('reuses existing visits bundles under always-reextract', () => {
      const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-visits-hold-'));
      try {
        seedVisits(root, ['2026-03-17', '2026-03-24']);

        const plan = buildPipelineIngestPlan({
          targetDate: '2026-04-15',
          days: 1,
          enabledSources: new Set(['visits']),
          replayMode: true,
          alwaysReextract: true,
          scope: 'north',
          rootDir: root,
        });

        assert.ok(!plan.steps.some((s) => s.action === 'extract_visits'));
        assert.equal(plan.steps.filter((s) => s.stage === 'visits' && s.action === 'reuse').length, 2);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('still extracts visit MDs that have no bundle yet', () => {
      const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-visits-new-'));
      try {
        seedVisits(root, ['2026-03-17'], { withBundles: true });
        seedVisits(root, ['2026-04-07'], { withBundles: false });

        const plan = buildPipelineIngestPlan({
          targetDate: '2026-04-15',
          days: 1,
          enabledSources: new Set(['visits']),
          replayMode: true,
          alwaysReextract: true,
          scope: 'north',
          rootDir: root,
        });

        const extracts = plan.steps.filter((s) => s.action === 'extract_visits');
        assert.equal(extracts.length, 1);
        assert.ok(extracts[0].detail.includes('2026-04-07'));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('--force still re-extracts visits despite the hold', () => {
      const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-visits-force-'));
      try {
        seedVisits(root, ['2026-03-17', '2026-03-24']);

        const plan = buildPipelineIngestPlan({
          targetDate: '2026-04-15',
          days: 1,
          enabledSources: new Set(['visits']),
          replayMode: true,
          alwaysReextract: true,
          force: true,
          scope: 'north',
          rootDir: root,
        });

        assert.equal(plan.steps.filter((s) => s.action === 'extract_visits').length, 2);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('leaves non-visits sources on always-reextract', () => {
      const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-news-reextract-'));
      try {
        const date = '2026-04-15';
        mkdirSync(resolve(newsArticlesPath(date, root), '..'), { recursive: true });
        mkdirSync(resolve(newsSignalsPath(date, root), '..'), { recursive: true });
        writeFileSync(newsArticlesPath(date, root), '# news');
        writeFileSync(newsSignalsPath(date, root), '{"signals":[]}');

        const plan = buildPipelineIngestPlan({
          targetDate: date,
          days: 1,
          enabledSources: new Set(['news']),
          replayMode: true,
          alwaysReextract: true,
          scope: 'north',
          rootDir: root,
        });

        const news = plan.steps.filter((s) => s.stage === 'news' && s.date === date);
        assert.ok(news.some((s) => s.action === 'extract_news'));
        assert.ok(!news.some((s) => s.action === 'reuse'));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});

function planWithPboBundle(bundle, { env = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-contract-'));
  const date = '2026-04-15';
  const prev = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    mkdirSync(join(root, 'business_modules/resilience_scorer/data/signals'), { recursive: true });
    writeFileSync(pboSignalsPath(date, root), bundle);
    let plan;
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_PBO: '1', ...env }, () => {
      plan = buildPipelineIngestPlan({
        targetDate: date,
        days: 1,
        enabledSources: new Set(['pbo']),
        replayMode: true,
        rootDir: root,
      });
    });
    return plan.steps.filter((s) => s.stage === 'pbo' && s.date === date);
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

describe('PBO extractor-contract gate (ingest planning)', () => {
  const marked = JSON.stringify({
    extractor_contract: 'pbo_llm_field_report',
    extractor_contract_version: 1,
    signals: [{ id: 's1' }],
  });

  it('re-extracts a marker-less bundle even under reuse-first replay', () => {
    // The exact scenario that kept serving the deleted deterministic extractor's output.
    const steps = planWithPboBundle(JSON.stringify({ signals: [{ id: 's1' }] }));
    assert.ok(steps.some((s) => s.action === 'extract_pbo_date'));
    assert.ok(!steps.some((s) => s.action === 'reuse'));
  });

  it('explains itself in the plan', () => {
    const steps = planWithPboBundle(JSON.stringify({ signals: [{ id: 's1' }] }));
    assert.equal(steps.find((s) => s.action === 'extract_pbo_date').detail, 'stale extractor contract');
  });

  it('reuses a bundle that carries the current contract', () => {
    const steps = planWithPboBundle(marked);
    assert.ok(steps.some((s) => s.action === 'reuse'));
  });

  it('re-extracts when the contract version is below the minimum', () => {
    const steps = planWithPboBundle(JSON.stringify({
      extractor_contract: 'pbo_llm_field_report',
      extractor_contract_version: 0,
      signals: [{ id: 's1' }],
    }));
    assert.ok(steps.some((s) => s.action === 'extract_pbo_date'));
  });

  it('treats an unparseable bundle as stale', () => {
    const steps = planWithPboBundle('{not json');
    assert.ok(steps.some((s) => s.action === 'extract_pbo_date'));
  });

  it('restores reuse when the gate is disabled', () => {
    const steps = planWithPboBundle(JSON.stringify({ signals: [{ id: 's1' }] }), {
      env: { RESILIENCE_PBO_CONTRACT_GATE_BLOCK: '0' },
    });
    assert.ok(steps.some((s) => s.action === 'reuse'));
  });
});
