import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveScoringPartition,
  summarizeQuarantinedSignals,
  QUARANTINE_REASON,
} from '../../../../../business_modules/resilience/domain/services/dataVoid/scoringPartition.js';

const fieldSig = {
  source_type: 'pbo',
  signal_type: 'service_continuity',
  evidence: 'Officers report continued shelter operations.',
  article_source: 'pbo-north',
};

const newsSig = {
  source_type: 'news',
  signal_type: 'fear_expression',
  evidence: 'Panic posts spreading on channels.',
  article_source: 'ynet.co.il',
};

const telegramSig = {
  source_type: 'telegram',
  signal_type: 'fear_expression',
  evidence: 'Telegram channel reports mass panic.',
  article_source: 'tg-channel-1',
};

const probeSig = {
  source_type: 'infrastructure_probe',
  signal_type: 'connectivity_outage',
  evidence: 'Regional connectivity probe reports outage.',
  article_source: 'connectivity-probe',
};

describe('scoringPartition', () => {
  it('returns normal partition when disabled', () => {
    const prev = process.env.RESILIENCE_SCORING_PARTITION;
    process.env.RESILIENCE_SCORING_PARTITION = '0';
    try {
      const r = resolveScoringPartition([fieldSig, newsSig], { digital_darkness: true, level: 'critical' });
      assert.equal(r.assessmentMode, 'normal');
      assert.equal(r.scoringSignals.length, 2);
      assert.equal(r.quarantinedSignals.length, 0);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_SCORING_PARTITION;
      else process.env.RESILIENCE_SCORING_PARTITION = prev;
    }
  });

  it('digital_darkness partitions to field-only scoring', () => {
    process.env.RESILIENCE_SCORING_PARTITION = '1';
    const r = resolveScoringPartition([fieldSig, newsSig, telegramSig], {
      digital_darkness: true,
      level: 'critical',
      field_volume: 1,
    });
    assert.equal(r.assessmentMode, 'field_anchor_only');
    assert.equal(r.scoringSignals.length, 1);
    assert.equal(r.scoringSignals[0].source_type, 'pbo');
    assert.equal(r.quarantinedSignals.length, 2);
    assert.equal(r.quarantineReason, QUARANTINE_REASON.DIGITAL_DARKNESS);
  });

  it('connectivity_outage with field active quarantines digital', () => {
    process.env.RESILIENCE_SCORING_PARTITION = '1';
    const r = resolveScoringPartition([fieldSig, telegramSig, telegramSig], {
      level: 'critical',
      connectivity_outage_signals: 1,
      field_volume: 1,
      actual_digital_volume: 2,
    });
    assert.equal(r.assessmentMode, 'field_anchor_only');
    assert.equal(r.scoringSignals.length, 1);
    assert.equal(r.quarantinedSignals.length, 2);
    assert.equal(r.quarantineReason, QUARANTINE_REASON.CONNECTIVITY_ISOLATION);
  });

  it('connectivity_outage without field quarantines digital and abstains', () => {
    process.env.RESILIENCE_SCORING_PARTITION = '1';
    const r = resolveScoringPartition([newsSig, telegramSig], {
      level: 'critical',
      connectivity_outage_signals: 1,
      field_volume: 0,
    });
    assert.equal(r.assessmentMode, 'abstained');
    assert.equal(r.scoringSignals.length, 2);
    assert.equal(r.quarantinedSignals.length, 2);
    assert.equal(r.quarantineReason, QUARANTINE_REASON.CONNECTIVITY_ISOLATION);
  });

  it('connectivity_outage with probe anchor includes soft press at partial weight', () => {
    process.env.RESILIENCE_SCORING_PARTITION = '1';
    const r = resolveScoringPartition([probeSig, newsSig, telegramSig], {
      level: 'critical',
      connectivity_outage_signals: 1,
      probe_outage: true,
      field_volume: 0,
    });
    assert.equal(r.assessmentMode, 'field_anchor_only');
    assert.equal(r.scoringSignals.length, 2);
    assert.equal(r.scoringSignals[0].source_type, 'infrastructure_probe');
    const softPress = r.scoringSignals.find((s) => s.source_type === 'news');
    assert.ok(softPress);
    assert.equal(softPress.partial_void_press, true);
    assert.equal(r.quarantinedSignals.length, 1);
    assert.equal(r.quarantinedSignals[0].source_type, 'telegram');
  });

  it('prior quarantine skipped when digital volume recovered (news present, no darkness)', () => {
    process.env.RESILIENCE_SCORING_PARTITION = '1';
    const r = resolveScoringPartition([fieldSig, newsSig], { level: 'none', digital_darkness: false }, {
      priorQuarantine: { active: true, reason: QUARANTINE_REASON.PRIOR_QUARANTINE },
    });
    assert.equal(r.assessmentMode, 'normal');
    assert.equal(r.partitionApplied, false);
    assert.equal(r.priorQuarantineSkipped, 'volume_recovered');
    assert.equal(r.scoringSignals.length, 2);
  });

  it('prior quarantine still partitions when no digital signals present', () => {
    process.env.RESILIENCE_SCORING_PARTITION = '1';
    const r = resolveScoringPartition([fieldSig], { level: 'none', digital_darkness: false }, {
      priorQuarantine: { active: true, reason: QUARANTINE_REASON.PRIOR_QUARANTINE },
    });
    assert.equal(r.assessmentMode, 'field_anchor_only');
    assert.equal(r.quarantinedSignals.length, 0);
    assert.equal(r.scoringSignals.length, 1);
  });

  it('digital_z_drop warning does not quarantine', () => {
    process.env.RESILIENCE_SCORING_PARTITION = '1';
    const r = resolveScoringPartition([fieldSig, newsSig], {
      level: 'warning',
      reason: 'digital_z_drop',
      digital_darkness: false,
    });
    assert.equal(r.assessmentMode, 'normal');
    assert.equal(r.partitionApplied, false);
    assert.equal(r.scoringSignals.length, 2);
  });

  it('normal day passes all signals through', () => {
    process.env.RESILIENCE_SCORING_PARTITION = '1';
    const r = resolveScoringPartition([fieldSig, newsSig], { level: 'none' });
    assert.equal(r.assessmentMode, 'normal');
    assert.equal(r.partitionApplied, false);
  });

  it('summarizeQuarantinedSignals builds summary', () => {
    const summary = summarizeQuarantinedSignals(
      [telegramSig, newsSig],
      QUARANTINE_REASON.CONNECTIVITY_ISOLATION,
    );
    assert.equal(summary.count, 2);
    assert.equal(summary.reason, QUARANTINE_REASON.CONNECTIVITY_ISOLATION);
    assert.equal(summary.by_source_type.telegram, 1);
    assert.equal(summary.by_source_type.news, 1);
    assert.equal(summary.sample_evidence.length, 2);
  });
});
