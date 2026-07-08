import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyFieldReportSignalHygiene,
  isTrivialFieldReportEvidence,
  resolveSignalTypeAlias,
  rewriteMisclassifiedFieldReportType,
  stripFieldReportScoreBlob,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/fieldReportSignalHygiene.js';

describe('fieldReportSignalHygiene', () => {
  it('isTrivialFieldReportEvidence flags empty and Hebrew stubs', () => {
    assert.equal(isTrivialFieldReportEvidence(''), true);
    assert.equal(isTrivialFieldReportEvidence('אין'), true);
    assert.equal(isTrivialFieldReportEvidence('[אעבלין] אין'), true);
    assert.equal(isTrivialFieldReportEvidence('ללא שינוי'), true);
    assert.equal(isTrivialFieldReportEvidence('Residents maintain shelter discipline'), false);
  });

  it('resolveSignalTypeAlias canonicalizes known aliases', () => {
    assert.equal(resolveSignalTypeAlias('leadership_visible_present'), 'leadership_visible_presence');
    assert.equal(resolveSignalTypeAlias('non_compliance'), 'compliance_partial');
    assert.equal(resolveSignalTypeAlias('compliance_enter_shelter'), 'compliance_enter_shelter');
  });

  it('stripFieldReportScoreBlob removes avg score prefix', () => {
    const raw = '[אעבלין] נרטיב: avg=81% (100%, 75%) — מתמודדים ברובם';
    assert.equal(stripFieldReportScoreBlob(raw), 'מתמודדים ברובם');
  });

  it('rewriteMisclassifiedFieldReportType maps backbone gap away from abandonment perception', () => {
    const evidence =
      'In Alkosh/Maaleh Yosef - Baram: community lacks the community backbone - recommendation to establish welfare coordination for leadership and joint community activity dimensions';
    assert.equal(rewriteMisclassifiedFieldReportType('institutional_abandonment_perception', evidence), 'coordination_failure');
    assert.equal(rewriteMisclassifiedFieldReportType('resource_shortage', evidence), 'coordination_failure');
    assert.equal(
      rewriteMisclassifiedFieldReportType('institutional_abandonment_perception', 'Residents say the state forgot us in the north'),
      'institutional_abandonment_perception',
    );
  });

  it('applyFieldReportSignalHygiene rewrites backbone mis-tags', () => {
    const out = applyFieldReportSignalHygiene([
      {
        signal_type: 'institutional_abandonment_perception',
        evidence:
          'In Alkosh: community lacks the community backbone - recommendation to establish welfare coordination for leadership',
        source_type: 'visits',
      },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].signal_type, 'coordination_failure');
  });

  it('applyFieldReportSignalHygiene drops trivial and rewrites aliases', () => {
    const out = applyFieldReportSignalHygiene([
      { signal_type: 'community_volunteering', evidence: 'אין', source_type: 'pbo' },
      { signal_type: 'leadership_visible_present', evidence: 'Mayor visible in shelters', source_type: 'pbo' },
      {
        signal_type: 'non_compliance',
        evidence: '[מסעדה] התנהגות: avg=42% (75%, 0%) — יוצאים לעבודה במהלך אזעקה',
        source_type: 'pbo',
      },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].signal_type, 'leadership_visible_presence');
    assert.equal(out[1].signal_type, 'compliance_partial');
    assert.ok(!out[1].evidence.includes('avg='));
  });
});
