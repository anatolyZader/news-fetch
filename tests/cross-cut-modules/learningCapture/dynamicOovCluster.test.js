import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  clusterMinThresholdForSource,
  evaluateDynamicOovClusters,
  evidenceHasHighSalience,
  extractKeywordsFromCluster,
  filterRecordsInWindow,
} from '../../../cross-cut-modules/learningCapture/dynamicOovCluster.js';
import { LEARNING_CAPTURE_KINDS } from '../../../cross-cut-modules/learningCapture/kinds.js';

describe('dynamicOovCluster', () => {
  const anchorMs = Date.parse('2026-05-29T14:00:00.000Z');

  it('filters records to rolling window', () => {
    const records = [
      { timestamp: '2026-05-29T13:30:00.000Z', capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE },
      { timestamp: '2026-05-29T10:00:00.000Z', capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE },
    ];
    const inWindow = filterRecordsInWindow(records, 2, anchorMs);
    assert.equal(inWindow.length, 1);
  });

  it('detects high-salience evidence', () => {
    assert.equal(evidenceHasHighSalience('Residents used drones to deliver insulin'), true);
    assert.equal(evidenceHasHighSalience('Residents traded food'), false);
  });

  it('lowers cluster threshold for field sources in digital darkness', () => {
    const normal = clusterMinThresholdForSource('field', { digitalDarkness: false });
    const dark = clusterMinThresholdForSource('field', { digitalDarkness: true });
    assert.ok(dark < normal);
    assert.equal(dark, 2);
  });

  it('extracts keywords from cluster evidence', () => {
    const cluster = {
      records: [
        { evidence: 'Consumer drones deliver insulin to elderly residents' },
        { evidence: 'Drone delivery of insulin reported again in cut-off district' },
      ],
    };
    const keywords = extractKeywordsFromCluster(cluster, 4);
    assert.ok(keywords.includes('drone') || keywords.includes('insulin'));
  });

  it('alerts on prefix cluster when count meets field threshold', async () => {
    const ts = '2026-05-29T13:00:00.000Z';
    const records = [1, 2, 3, 4].map((i) => ({
      capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
      suggested_type: 'consumer_drone_delivery',
      evidence: `Residents organized rooftop garden sharing circle variant ${i} in isolated district`,
      source_label: 'field-report-batch',
      timestamp: ts,
    }));

    const result = await evaluateDynamicOovClusters(records, {
      windowHours: 2,
      anchorMs,
      operatorMin: 20,
    });

    assert.equal(result.alert, true);
    assert.equal(result.level, 'warning');
    assert.equal(result.top_cluster_count, 4);
    assert.ok(Array.isArray(result.top_cluster_keywords));
  });

  it('critical alert with salience bypass at lower count', async () => {
    const ts = '2026-05-29T13:15:00.000Z';
    const records = [1, 2].map((i) => ({
      capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
      suggested_type: 'consumer_drone_delivery',
      evidence: `Residents used consumer drones to deliver insulin to elderly ${i}`,
      source_label: 'field-report-batch',
      timestamp: ts,
    }));

    const result = await evaluateDynamicOovClusters(records, {
      windowHours: 2,
      anchorMs,
      operatorMin: 10,
    });

    assert.equal(result.alert, true);
    assert.equal(result.level, 'critical');
    assert.equal(result.salience_bypass, true);
    assert.equal(result.cluster_threshold, 2);
  });

  it('uses embedding clustering when embedFn provided', async () => {
    const ts = '2026-05-29T13:20:00.000Z';
    const records = [
      {
        capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
        suggested_type: 'alpha',
        evidence: 'Drone insulin delivery to seniors',
        source_label: 'news-batch',
        timestamp: ts,
      },
      {
        capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
        suggested_type: 'beta',
        evidence: 'Drone medicine delivery for elderly',
        source_label: 'news-batch',
        timestamp: ts,
      },
      {
        capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
        suggested_type: 'gamma',
        evidence: 'Unrelated barter market for vegetables',
        source_label: 'news-batch',
        timestamp: ts,
      },
    ];

    const droneVec = new Float32Array([1, 0, 0]);
    const barterVec = new Float32Array([0, 1, 0]);

    const result = await evaluateDynamicOovClusters(records, {
      windowHours: 2,
      anchorMs,
      operatorMin: 20,
      embedFn: async (text) => ({
        vector: text.includes('Drone') || text.includes('drone') ? droneVec : barterVec,
      }),
    });

    assert.equal(result.clustering_method, 'embedding');
    assert.equal(result.top_cluster_count, 2);
    assert.equal(result.alert, true);
    assert.equal(result.salience_bypass, true);
  });
});
