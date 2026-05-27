import { describe, it } from 'node:test';
import assert from 'node:assert';

import { computeDataVoidIndex } from '../../../../../business_modules/resilience/domain/services/dataVoidIndex.js';
import { probeRecordToSignal } from '../../../../../business_modules/resilience/infrastructure/adapters/connectivityProbeFileAdapter.js';

const histDigital = [
  [
    { source_type: 'whatsapp', article_source: 'a', evidence: 'a' },
    { source_type: 'news', article_source: 'b', evidence: 'b' },
    { source_type: 'news', article_source: 'c', evidence: 'c' },
  ],
  [
    { source_type: 'whatsapp', article_source: 'a2', evidence: 'a' },
    { source_type: 'news', article_source: 'b2', evidence: 'b' },
    { source_type: 'news', article_source: 'c2', evidence: 'c' },
  ],
];

describe('dataVoidIndex v2', () => {
  it('flags digital_darkness when digital silent but field active', () => {
    const r = computeDataVoidIndex(
      [{ source_type: 'pbo', signal_type: 'service_continuity', evidence: 'officer report', article_source: 'pbo1' }],
      histDigital,
    );
    assert.equal(r.digital_darkness, true);
    assert.equal(r.level, 'critical');
    assert.equal(r.reason, 'digital_darkness');
    assert.ok(r.information_vacuum_index >= 0.8);
  });

  it('does not flag digital_darkness when digital and field both active', () => {
    const r = computeDataVoidIndex(
      [
        { source_type: 'whatsapp', evidence: 'chat', article_source: 'wa1' },
        { source_type: 'pbo', evidence: 'field', article_source: 'pbo1' },
      ],
      histDigital,
    );
    assert.equal(r.digital_darkness, false);
  });

  it('total silence (both channels dead) with baseline → critical', () => {
    const r = computeDataVoidIndex([], histDigital);
    assert.equal(r.total_silence, true);
    assert.equal(r.level, 'critical');
    assert.equal(r.reason, 'total_silence');
  });

  it('quiet weekend: low non-zero digital, no field, low baseline → not critical', () => {
    const r = computeDataVoidIndex(
      [{ source_type: 'news', article_source: 'one', evidence: 'quiet' }],
      [[{ source_type: 'news', article_source: 'x', evidence: 'a' }]],
    );
    assert.notEqual(r.level, 'critical');
    assert.equal(r.total_silence, false);
  });

  it('partial drop on both channels → critical partial_silence', () => {
    const heavyHist = [
      Array.from({ length: 8 }, (_, i) => ({
        source_type: 'news',
        article_source: `n${i}`,
        evidence: `e${i}`,
      })),
      Array.from({ length: 8 }, (_, i) => ({
        source_type: 'news',
        article_source: `m${i}`,
        evidence: `f${i}`,
      })),
    ];
    const heavyFieldHist = heavyHist.map((day) => [
      ...day,
      { source_type: 'pbo', article_source: 'pbo', evidence: 'field' },
      { source_type: 'pbo', article_source: 'pbo2', evidence: 'field2' },
      { source_type: 'pbo', article_source: 'pbo3', evidence: 'field3' },
    ]);
    const r = computeDataVoidIndex(
      [{ source_type: 'news', article_source: 'only', evidence: 'one' }],
      heavyFieldHist,
    );
    assert.equal(r.partial_silence, true);
    assert.equal(r.level, 'critical');
    assert.equal(r.reason, 'partial_silence');
  });

  it('north-scoped void: national digital does not mask north silence', () => {
    const northField = [
      {
        source_type: 'pbo',
        evidence: 'north officer',
        article_source: 'pbo-n',
        geo: { kind: 'resolved', classification: { pboSubregionId: 'golan', geoAreaTags: ['north'] } },
      },
    ];
    const histNorth = histDigital.map((day) =>
      day.filter((s) => s.source_type === 'pbo' || s.geo?.classification?.geoAreaTags?.includes('north')),
    );
    const r = computeDataVoidIndex(northField, histNorth, { reportScope: 'north' });
    assert.equal(r.digital_darkness, true);
  });

  it('field_whatsapp counts as field anchor for digital_darkness', () => {
    const r = computeDataVoidIndex(
      [{ source_type: 'field_whatsapp', article_source: 'officer-dm', evidence: 'reserve channel' }],
      histDigital,
    );
    assert.equal(r.digital_darkness, true);
    assert.ok(r.field_volume >= 1);
  });

  it('infrastructure_probe outage forces critical', () => {
    const probe = probeRecordToSignal({
      date: '2026-05-01',
      probe_source: 'netblocks-manual',
      outage_detected: true,
      evidence: 'Nationwide mobile blackout',
    });
    const r = computeDataVoidIndex([probe], []);
    assert.equal(r.level, 'critical');
    assert.equal(r.probe_outage, true);
  });
});
