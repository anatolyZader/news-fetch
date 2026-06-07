import { describe, it, mock, before, after } from 'node:test';
import assert from 'node:assert';

import { RESILIENCE_COMPONENTS } from '../../../../business_modules/resilience/domain/resilienceComponents.js';
import {
  runResilienceAssessment,
  MAX_BODY_CHARS,
} from '../../../../business_modules/resilience/app/resilienceAnalysisService.js';

function minimalAssessment(date, totalArticles, contentKind) {
  return {
    date,
    total_articles_analyzed: totalArticles,
    overall_resilience_score: 5,
    content_kind: contentKind,
    cross_component_synthesis: 'syn',
    evidence_quality_note: 'ok',
    components: RESILIENCE_COMPONENTS.map((c) => ({
      component_id: c.id,
      score: 5,
      confidence: 'medium',
      signal_count: 1,
      distinct_article_count: 1,
      source_diversity: 0,
      coverage_ratio: 0.5,
      dispersion: 'low',
      coverage_adjustment: 0,
      positive_evidence: 1,
      negative_evidence: 0,
      net_evidence: 1,
      evidence_mass: 1,
      strength: 0.5,
      adjusted_strength: 0.5,
      certainty: 0.5,
      manifestations_evidenced: [],
      manifestations_absent: [],
      evidence: [],
      narrative: 'narrative',
    })),
  };
}

const validSignal = {
  article_index: 1,
  article_url: 'https://example.com/a',
  signal_type: 'information_clarity',
  evidence_type: 'named_institutional_fact',
  evidence: 'Official channel published clear instructions.',
  scope_level: 'single_case',
};

describe('runResilienceAssessment', () => {
  let prevAssessmentAgent;

  before(() => {
    prevAssessmentAgent = process.env.RESILIENCE_ASSESSMENT_AGENT;
    process.env.RESILIENCE_ASSESSMENT_AGENT = '0';
  });

  after(() => {
    if (prevAssessmentAgent === undefined) delete process.env.RESILIENCE_ASSESSMENT_AGENT;
    else process.env.RESILIENCE_ASSESSMENT_AGENT = prevAssessmentAgent;
  });

  it('throws when llmPort is missing', async () => {
    await assert.rejects(
      () =>
        runResilienceAssessment(
          {
            reportDate: '2026-03-22',
            contentKind: 'news',
            items: [{ id: '1', title: 'T', body: 'b' }],
          },
          {},
        ),
      /llmPort/i,
    );
  });

  it('truncates item body to MAX_BODY_CHARS', async () => {
    let captured = [];
    const longBody = 'x'.repeat(MAX_BODY_CHARS + 500);
    const llmPort = {
      extractSignals: async (articles) => {
        captured = articles;
        return [validSignal];
      },
      generateNarratives: async (_scored, _signals, date, totalArticles, opts) =>
        minimalAssessment(date, totalArticles, opts.contentKind),
    };

    await runResilienceAssessment(
      {
        reportDate: '2026-03-22',
        contentKind: 'news',
        items: [{ id: '1', title: 'T', body: longBody }],
      },
      { llmPort },
    );

    assert.equal(captured.length, 1);
    assert.equal(captured[0].body.length, MAX_BODY_CHARS);
  });

  it('dedupes by title when dedupeTitles is true', async () => {
    let captured = [];
    const llmPort = {
      extractSignals: async (articles) => {
        captured = articles;
        return [validSignal];
      },
      generateNarratives: async (_sc, _si, date, total, opts) => minimalAssessment(date, total, opts.contentKind),
    };

    await runResilienceAssessment(
      {
        reportDate: '2026-03-22',
        contentKind: 'news',
        items: [
          { id: '1', title: 'Same Title!', body: 'a' },
          { id: '2', title: 'Same Title?', body: 'b' },
        ],
      },
      { llmPort, dedupeTitles: true },
    );

    assert.equal(captured.length, 1);
  });

  it('does not dedupe by title when dedupeTitles is false', async () => {
    let captured = [];
    const llmPort = {
      extractSignals: async (articles) => {
        captured = articles;
        return [validSignal, { ...validSignal, article_index: 2 }];
      },
      generateNarratives: async (_sc, _si, date, total, opts) => minimalAssessment(date, total, opts.contentKind),
    };

    await runResilienceAssessment(
      {
        reportDate: '2026-03-22',
        contentKind: 'news',
        items: [
          { id: '1', title: 'Same Title!', body: 'a' },
          { id: '2', title: 'Same Title?', body: 'b' },
        ],
      },
      { llmPort, dedupeTitles: false },
    );

    assert.equal(captured.length, 2);
  });

  it('returns provenance and assessment compatible with report shape', async () => {
    const llmPort = {
      extractSignals: async () => [validSignal],
      generateNarratives: async (_sc, _si, date, total, opts) => minimalAssessment(date, total, opts.contentKind),
    };

    const result = await runResilienceAssessment(
      {
        reportDate: '2026-03-22',
        contentKind: 'audio',
        sourceRunId: 'run-42',
        items: [
          { id: 'a', title: 'Seg 1', body: 'text', sourceLabel: 'KAN' },
          { id: 'b', title: 'Seg 2', body: 'more', sourceLabel: 'KAN' },
        ],
      },
      { llmPort, dedupeTitles: false },
    );

    assert.equal(result.provenance.contentKind, 'audio');
    assert.equal(result.provenance.itemCount, 2);
    assert.equal(result.provenance.sourceRunId, 'run-42');
    assert.ok(Array.isArray(result.provenance.sourceLabels));
    assert.ok(result.provenance.sourceLabels.includes('KAN'));
    assert.equal(result.assessment.date, '2026-03-22');
    assert.equal(result.assessment.components.length, 8);
    assert.ok(Array.isArray(result.signals));
    assert.equal(result.assessment.content_kind, 'audio');
  });

  it('passes priorAssessments to generateNarratives as priorReports', async () => {
    const prior = [{ date: '2026-03-21', overall_resilience_score: 4, components: [] }];
    let receivedPrior = null;
    const llmPort = {
      extractSignals: async () => [validSignal],
      generateNarratives: async (_sc, _si, date, total, opts) => {
        receivedPrior = opts.priorReports;
        return minimalAssessment(date, total, opts.contentKind);
      },
    };

    await runResilienceAssessment(
      {
        reportDate: '2026-03-22',
        contentKind: 'news',
        items: [{ id: '1', title: 'T', body: 'b' }],
        priorAssessments: prior,
      },
      { llmPort },
    );

    assert.deepStrictEqual(receivedPrior, prior);
  });

  it('calls reportWriterPort when persist is true', async () => {
    const writeReport = mock.fn(() => ({ mdPath: '/x.md', jsonPath: '/x.json' }));
    const reportWriterPort = { writeReport };
    const llmPort = {
      extractSignals: async () => [validSignal],
      generateNarratives: async (_sc, _si, date, total, opts) => minimalAssessment(date, total, opts.contentKind),
    };

    await runResilienceAssessment(
      {
        reportDate: '2026-03-22',
        contentKind: 'news',
        items: [{ id: '1', title: 'T', body: 'b' }],
      },
      {
        llmPort,
        reportWriterPort,
        persist: true,
        outputBase: '/tmp/resilience-test-out',
        reportSourceFiles: ['articles-homefront.md'],
      },
    );

    assert.equal(writeReport.mock.calls.length, 1);
    const arg = writeReport.mock.calls[0].arguments[0];
    assert.equal(arg.outputBase, '/tmp/resilience-test-out');
    assert.ok(arg.assessment);
    assert.ok(Array.isArray(arg.signals));
    assert.deepStrictEqual(arg.sourceFiles, ['articles-homefront.md']);
  });

  it('merges two extraction passes when RESILIENCE_SECOND_EXTRACT=1', async () => {
    const prev = process.env.RESILIENCE_SECOND_EXTRACT;
    process.env.RESILIENCE_SECOND_EXTRACT = '1';
    let calls = 0;
    const s2 = {
      ...validSignal,
      signal_type: 'fear_expression',
      evidence: 'Second pass only unique evidence for merge test.',
    };
    const llmPort = {
      extractSignals: async () => {
        calls += 1;
        if (calls === 1) return [validSignal];
        return [s2];
      },
      generateNarratives: async (_sc, signals, date, total, opts) => {
        assert.equal(signals.length, 1, 'veto mode keeps only cross-pass agreed signals');
        return minimalAssessment(date, total, opts.contentKind);
      },
    };
    try {
      await runResilienceAssessment(
        {
          reportDate: '2026-03-22',
          contentKind: 'news',
          items: [{ id: '1', title: 'T', body: 'b' }],
        },
        { llmPort },
      );
      assert.equal(calls, 2);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_SECOND_EXTRACT;
      else process.env.RESILIENCE_SECOND_EXTRACT = prev;
    }
  });
});
