import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DEFAULT_VALIDATION_CONFIG,
  computeElevationAdvisory,
  loadValidationConfig,
  validationPaths,
} from '../../../../../business_modules/resilience/validation/config/validationConfig.js';
import {
  articleKeyForSignal,
  buildReviewQueue,
} from '../../../../../business_modules/resilience/validation/domain/reviewQueueBuilder.js';
import { buildValidationRecord } from '../../../../../business_modules/resilience/validation/domain/validationRecordBuilder.js';
import createValidationCollectionService from '../../../../../business_modules/resilience/validation/app/validationCollectionService.js';

describe('validationConfig', () => {
  it('loads defaults when file missing', () => {
    const cfg = loadValidationConfig('/nonexistent/validation-config.json');
    assert.equal(cfg._loaded, false);
    assert.equal(cfg.operational_phase, 'baseline');
  });

  it('computes elevation advisory when volume thresholds met', () => {
    const cfg = { ...DEFAULT_VALIDATION_CONFIG, operational_phase: 'baseline' };
    const adv = computeElevationAdvisory({ signalCount: 200, articleCount: 10 }, cfg);
    assert.ok(adv);
    assert.equal(adv.suggested_phase, 'elevated');
    assert.equal(adv.advisory_only, true);
  });

  it('does not advise when already acute', () => {
    const cfg = { ...DEFAULT_VALIDATION_CONFIG, operational_phase: 'acute' };
    const adv = computeElevationAdvisory({ signalCount: 500, articleCount: 100 }, cfg);
    assert.equal(adv, null);
  });
});

describe('reviewQueueBuilder', () => {
  it('dedupes by article url and ranks significant delta first', () => {
    const assessment = {
      date: '2026-05-23',
      report_scope: { id: 'national' },
      components: [
        {
          component_id: 'services',
          delta_flag: 'significant',
          delta_significance: -2.5,
          evidence_mass: 6,
          polarization: 0.2,
          top_contributors: [
            {
              signal_type: 'service_disruption',
              source_type: 'news',
              article_url: 'https://example.com/a',
              article_source: 'Ynet',
              evidence: 'Schools closed',
              _contribution: 2.1,
            },
          ],
        },
        {
          component_id: 'leadership',
          counterfactual_delta: 2,
          evidence_mass: 5,
          polarization: 0.1,
          top_contributors: [
            {
              signal_type: 'leadership_visible_presence',
              source_type: 'news',
              article_url: 'https://example.com/a',
              article_source: 'Ynet',
              evidence: 'Mayor spoke',
              _contribution: 1.5,
            },
          ],
        },
      ],
    };

    const queue = buildReviewQueue({
      assessment,
      signals: [],
      reviewConfig: { max_items_per_day: 10, random_control_rate: 0 },
    });

    assert.equal(queue.item_count, 1);
    assert.equal(queue.items[0].article_url, 'https://example.com/a');
    assert.ok(queue.items[0].priority >= 10);
    assert.ok(queue.items[0].component_ids.includes('services'));
  });

  it('articleKeyForSignal prefers url', () => {
    assert.equal(
      articleKeyForSignal({ article_url: 'https://x.test/1', article_index: 3 }),
      'url:https://x.test/1',
    );
  });

  it('flags oov_suggested and contested_thin on review items', () => {
    const assessment = {
      date: '2026-05-23',
      oov_capture_count: 3,
      data_void: { level: 'critical' },
      report_scope: { id: 'national' },
      components: [{
        component_id: 'wellbeing_at_risk',
        polarization: 0.7,
        evidence_mass: 2,
        suppression_delta: 2,
        source_cap_binding: true,
        top_contributors: [],
      }],
    };
    const queue = buildReviewQueue({
      assessment,
      signals: [{
        signal_type: 'novel_behavior_x',
        article_url: 'https://example.com/oov',
        extraction_confidence: 0.4,
        evidence: 'Unusual pattern',
      }],
      reviewConfig: { max_items_per_day: 10, random_control_rate: 0 },
    });
    assert.equal(queue.item_count, 1);
    const codes = queue.items[0].reasons.map((r) => r.code);
    assert.ok(codes.includes('oov_suggested'));
    assert.ok(codes.includes('data_void_context'));
  });
});

describe('validationCollectionService', () => {
  it('writes record and review queue under validation dir', () => {
    const root = mkdtempSync(join(tmpdir(), 'validation-test-'));
    const config = {
      ...DEFAULT_VALIDATION_CONFIG,
      operational_phase: 'elevated',
      phase_started_at: '2026-05-20T00:00:00.000Z',
    };

    const svc = createValidationCollectionService({
      loadConfig: () => config,
    });

    const assessment = {
      date: '2026-05-23',
      report_scope: { id: 'national', label: 'National' },
      total_articles_analyzed: 12,
      overall_resilience_score: 6.2,
      methodology: {},
      components: [
        {
          component_id: 'narrative',
          score: 5,
          confidence: 'medium',
          certainty: 0.5,
          evidence_mass: 4,
          polarization: 0.6,
          delta_significance: 2.2,
          delta_flag: 'significant',
          signal_count: 3,
          distinct_article_count: 2,
          top_contributors: [{
            signal_type: 'fear_expression',
            article_url: 'https://example.com/fear',
            evidence: 'Residents anxious',
            _contribution: 1.2,
          }],
        },
      ],
    };

    const result = svc.collectAfterAssessment({
      assessment,
      signals: [{
        signal_type: 'fear_expression',
        article_url: 'https://example.com/fear',
        evidence: 'Residents anxious',
        extraction_confidence: 0.4,
      }],
      reportJsonPath: join(root, 'daily_reports', 'resilience-report-2026-05-23.json'),
      signalPaths: [join(root, 'signals', 'signals-news-2026-05-23.json')],
      pipelineConfig: { sources: { news: { enabled: true } } },
      rootDir: root,
    });

    assert.equal(result.skipped, false);
    assert.ok(existsSync(result.recordPath));
    assert.ok(existsSync(result.reviewQueuePath));
    assert.ok(result.reviewItemCount >= 1);

    const record = JSON.parse(readFileSync(result.recordPath, 'utf8'));
    assert.equal(record.operational_phase, 'elevated');
    assert.equal(record.provenance.total_signals, 1);
    assert.ok(assessment.methodology.validation);
    assert.ok(assessment.methodology.validation.last_collection);
  });

  it('buildValidationRecord includes elevation advisory', () => {
    const record = buildValidationRecord({
      assessment: {
        date: '2026-05-23',
        report_scope: { id: 'national' },
        total_articles_analyzed: 50,
        components: [],
      },
      signals: Array.from({ length: 160 }, () => ({ signal_type: 'fear_expression' })),
      reportJsonPath: join(tmpdir(), 'report.json'),
      validationConfig: { ...DEFAULT_VALIDATION_CONFIG, operational_phase: 'baseline' },
    });
    assert.ok(record.elevation_advisory);
    assert.equal(record.shadow_collection, true);
  });
});

describe('validationPaths', () => {
  it('resolves subdirs from config', () => {
    const paths = validationPaths(DEFAULT_VALIDATION_CONFIG, '/proj');
    assert.equal(
      paths.root,
      '/proj/business_modules/resilience/validation/artifacts',
    );
    assert.equal(
      paths.records,
      '/proj/business_modules/resilience/validation/artifacts/records',
    );
  });
});
