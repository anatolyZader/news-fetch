import { describe, it, mock, before, after } from 'node:test';
import assert from 'node:assert';

import { RESILIENCE_COMPONENTS } from '../../../../business_modules/resilience/domain/resilienceComponents.js';
import {
  runResilienceAssessment,
  MAX_BODY_CHARS,
} from '../../../../business_modules/resilience/app/resilienceAnalysisService.js';

const validSignal = {
  article_index: 1,
  article_url: 'https://example.com/a',
  signal_type: 'information_clarity',
  evidence_type: 'named_institutional_fact',
  evidence: 'Official channel published clear instructions.',
  scope_level: 'single_case',
};

describe('runResilienceAssessment', () => {
  let prevForceDeterministic;
  let prevClosedCore;

  before(() => {
    prevForceDeterministic = process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC;
    prevClosedCore = process.env.RESILIENCE_CLOSED_CORE_ASSESS;
    process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC = '1';
    process.env.RESILIENCE_CLOSED_CORE_ASSESS = '0';
  });

  after(() => {
    if (prevForceDeterministic === undefined) delete process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC;
    else process.env.RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC = prevForceDeterministic;
    if (prevClosedCore === undefined) delete process.env.RESILIENCE_CLOSED_CORE_ASSESS;
    else process.env.RESILIENCE_CLOSED_CORE_ASSESS = prevClosedCore;
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
    assert.equal(result.assessment.components.length, RESILIENCE_COMPONENTS.length);
    assert.ok(Array.isArray(result.signals));
  });

  it('calls reportWriterPort when persist is true', async () => {
    const writeReport = mock.fn(() => ({ mdPath: '/x.md', jsonPath: '/x.json' }));
    const reportWriterPort = { writeReport };
    const llmPort = {
      extractSignals: async () => [validSignal],
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
    };
    try {
      const result = await runResilienceAssessment(
        {
          reportDate: '2026-03-22',
          contentKind: 'news',
          items: [{ id: '1', title: 'T', body: 'b' }],
        },
        { llmPort },
      );
      assert.equal(calls, 2);
      assert.equal(result.signals.length, 1, 'veto mode keeps only cross-pass agreed signals');
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_SECOND_EXTRACT;
      else process.env.RESILIENCE_SECOND_EXTRACT = prev;
    }
  });
});
