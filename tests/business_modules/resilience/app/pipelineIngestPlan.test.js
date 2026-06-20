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
  pboSignalsPath,
  pipelineOpenObservationsPath,
  socialSignalsPath,
  fieldSignalsPath,
} from '../../../../business_modules/resilience/domain/services/pipelineArtifactPaths.js';
import { openPipelineObsNeedsExtract } from '../../../../business_modules/resilience/app/pipelineOpenObsGuard.js';
import { pipelineObservationBundleFilename } from '../../../../business_modules/signals_extraction/domain/services/observationSchema.js';

const REPLAY_REUSE_ENV_KEYS = [
  'RESILIENCE_REPLAY_REUSE_NEWS',
  'RESILIENCE_REPLAY_REUSE_RADIO',
  'RESILIENCE_REPLAY_REUSE_WHATSAPP',
  'RESILIENCE_REPLAY_REUSE_VISITS',
  'RESILIENCE_REPLAY_REUSE_FIELD',
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
  });

  it('plans extract_open_only when closed signals exist but open obs are missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-open-'));
    const prev = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_NEWS: '1' }, () => {
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
  });

  it('reuses only when both closed and open obs exist with observations', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-open-'));
    const prev = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_NEWS: '1' }, () => {
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
  });

  it('plans extract_open_only when open bundle has empty observations', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-open-'));
    const prev = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_NEWS: '1' }, () => {
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
    const prev = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
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
        if (prev == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
        else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prev;
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('skips field and naftali extraction in replay mode when reuse enabled', () => {
    withReplayReuseEnv({
      RESILIENCE_REPLAY_REUSE_FIELD: '1',
      RESILIENCE_REPLAY_REUSE_NAFTALI: '1',
    }, () => {
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
        assert.ok(!plan.steps.some((s) => s.action === 'extract_visits'));
        assert.ok(!plan.steps.some((s) => s.action === 'extract_naftali'));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('plans extract_pbo_date in replay when closed PBO exists but open obs missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-pbo-'));
    const prev = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    try {
      const dates = ['2026-04-13', '2026-04-14', '2026-04-15'];
      const sigDir = join(root, 'business_modules/signals_extraction/data/signals');
      mkdirSync(sigDir, { recursive: true });
      for (const date of dates) {
        writeFileSync(pboSignalsPath(date, root), JSON.stringify({ signals: [{ id: 's1' }] }));
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
      if (prev == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
      else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prev;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reuses PBO in replay when both closed and open obs exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-pbo-'));
    const prev = process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
    process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = '1';
    withReplayReuseEnv({ RESILIENCE_REPLAY_REUSE_PBO: '1' }, () => {
      try {
        const date = '2026-04-15';
        const sigDir = join(root, 'business_modules/signals_extraction/data/signals');
        const dataDir = join(root, 'business_modules/signals_extraction/data');
        mkdirSync(sigDir, { recursive: true });
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(pboSignalsPath(date, root), JSON.stringify({ signals: [{ id: 's1' }] }));
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
        if (prev == null) delete process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL;
        else process.env.RESILIENCE_OPEN_EXTRACT_PARALLEL = prev;
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
          join(visitsDir, `articles-field-reports-${date}.md`),
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
        const sigDir = join(root, 'business_modules/signals_extraction/data/signals');
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
      const sigDir = join(root, 'business_modules/signals_extraction/data/signals');
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

  it('always-reextract plans all visit MDs not only last three', () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-plan-visits-all-'));
    try {
      const visitsDir = join(root, 'business_modules/visits/data');
      mkdirSync(visitsDir, { recursive: true });
      for (const d of ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04']) {
        writeFileSync(join(visitsDir, `articles-field-reports-${d}.md`), '# visit');
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
