import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applySignalTypeHygiene,
  rewriteMisclassifiedSignalType,
  shouldDropNonResilienceCasualtySignal,
  isBareHazardTickerEvidence,
  resolveSignalTypeAlias,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/signalTypeHygiene.js';
import {
  applyFieldReportSignalHygiene,
  isTrivialFieldReportEvidence,
  stripFieldReportScoreBlob,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/fieldReportHygiene.js';

describe('signalTypeHygiene', () => {
  const holySepulcherEvidence =
    "Catholic leaders lead prayers in a Jerusalem church without public attendance as the city's major holy sites continue to be closed due to the ongoing Iran war. The Latin Patriarch, Cardinal Pierbattista Pizzaballa, led Holy Thursday prayers at the Church of the Holy Sepulcher in Jerusalem without public attendance";

  it('rewriteMisclassifiedSignalType maps closed-site rituals to service_disruption', () => {
    assert.equal(rewriteMisclassifiedSignalType('cultural_continuity', holySepulcherEvidence), 'service_disruption');
    assert.equal(
      rewriteMisclassifiedSignalType(
        'cultural_continuity',
        'Passover seder held with public attendance despite rocket alerts in Kiryat Shmona',
      ),
      'cultural_continuity',
    );
  });

  it('applySignalTypeHygiene rewrites news cultural_continuity closure stories', () => {
    const out = applySignalTypeHygiene([
      {
        signal_type: 'cultural_continuity',
        evidence: holySepulcherEvidence,
        source_type: 'news',
      },
    ]);
    assert.equal(out[0].signal_type, 'service_disruption');
  });

  it('splitBundledHarmInfrastructure peels kindergarten damage from harm bundle', () => {
    const kipaEvidence =
      'בקריית שמונה ובבענה מספר בני אדם נפצעו באורח קל, גן ילדים בנהריה ניזוק. במקביל, איראן שיגרה לאורך החג כ-10 טילים, מספר בני אדם נפצעו באורח קל בבני ברק, בהם שני תינוקות';
    const out = applySignalTypeHygiene([
      {
        signal_type: 'harm_to_population',
        evidence: kipaEvidence,
        source_type: 'news',
        article_index: 1,
      },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].signal_type, 'harm_to_population');
    assert.match(out[0].evidence, /קריית שמונה/);
    assert.match(out[0].evidence, /בני ברק/);
    assert.ok(!out[0].evidence.includes('גן ילדים'));
    assert.equal(out[1].signal_type, 'infrastructure_damage_acute');
    assert.match(out[1].evidence, /גן ילדים בנהריה ניזוק/);
  });

  it('splitBundledHarmInfrastructure rewrites infra-only mis-tags', () => {
    const out = applySignalTypeHygiene([
      {
        signal_type: 'harm_to_population',
        evidence: 'גן ילדים בנהריה ניזוק מפגיעת טיל',
        source_type: 'news',
      },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].signal_type, 'infrastructure_damage_acute');
  });

  it('shouldDropNonResilienceCasualtySignal drops crime and EMS roll-ups', () => {
    assert.equal(
      shouldDropNonResilienceCasualtySignal({
        signal_type: 'harm_to_population',
        evidence: 'אתמול נרצח בבאקה אל-גרבייה עודאי עיאט שנורה מטווח אפס ותוך כדי מרדף',
      }),
      true,
    );
    assert.equal(
      shouldDropNonResilienceCasualtySignal({
        signal_type: 'population_survey_finding',
        evidence: 'מתחילת מבצע שאגת הארי צוותי מגן דוד אדום העניקו טיפול רפואי ל- 2,223 בני אדם',
      }),
      true,
    );
    assert.equal(
      shouldDropNonResilienceCasualtySignal({
        signal_type: 'harm_to_population',
        evidence: 'שניים נפצעו משברי יירוט מירי מלבנון בבענה',
      }),
      false,
    );
  });

  it('drops bare siren city-list routine_disruption tickers', () => {
    const ynetTicker =
      'אזעקות המתריעות על ירי טילים ורקטות הופעלו במרכז, בשרון ובשומרון, בין היתר בהרצליה, רמת השרון, חולון, אלעד, כפר קאסם, רעננה';
    assert.equal(isBareHazardTickerEvidence(ynetTicker), true);
    assert.equal(
      shouldDropNonResilienceCasualtySignal({ signal_type: 'routine_disruption', evidence: ynetTicker }),
      true,
    );
    const out = applySignalTypeHygiene([
      { signal_type: 'routine_disruption', evidence: ynetTicker, source_type: 'news' },
    ]);
    assert.equal(out.length, 0);
  });

  it('keeps behavioral and warning-system signals that mention alerts', () => {
    assert.equal(
      shouldDropNonResilienceCasualtySignal({
        signal_type: 'early_warning_system_failure',
        evidence: 'רקטה התפוצצה בקריית שמונה בלי אזעקה',
      }),
      false,
    );
    assert.equal(
      shouldDropNonResilienceCasualtySignal({
        signal_type: 'compliance_enter_shelter',
        evidence: 'בשעה 2:00 מיליונים נכנסו למרחבים המוגנים בעקבות הישמע האזעקות',
      }),
      false,
    );
    assert.equal(
      shouldDropNonResilienceCasualtySignal({
        signal_type: 'routine_disruption',
        evidence: 'In Arrabe al-Aramsha - Baram, there was no movement of residents.',
      }),
      false,
    );
  });

  it('isTrivialFieldReportEvidence flags empty and Hebrew stubs', () => {
    assert.equal(isTrivialFieldReportEvidence(''), true);
    assert.equal(isTrivialFieldReportEvidence('אין'), true);
    assert.equal(isTrivialFieldReportEvidence('[אעבלין] אין'), true);
    assert.equal(isTrivialFieldReportEvidence('ללא שינוי'), true);
    assert.equal(isTrivialFieldReportEvidence('Residents maintain shelter discipline'), false);
  });

  it('resolveSignalTypeAlias canonicalizes known aliases', () => {
    assert.equal(resolveSignalTypeAlias('leadership_visible_present'), 'leadership_visible_presence');
    assert.equal(resolveSignalTypeAlias('non_compliance'), 'non_compliance_ignore_guidelines');
    assert.equal(resolveSignalTypeAlias('compliance_enter_shelter'), 'compliance_enter_shelter');
  });

  it('stripFieldReportScoreBlob removes avg score prefix', () => {
    const raw = '[אעבלין] נרטיב: avg=81% (100%, 75%) — מתמודדים ברובם';
    assert.equal(stripFieldReportScoreBlob(raw), 'מתמודדים ברובם');
  });

  it('rewriteMisclassifiedSignalType maps backbone gap away from abandonment perception', () => {
    const evidence =
      'In Alkosh/Maaleh Yosef - Baram: community lacks the community backbone - recommendation to establish welfare coordination for leadership and joint community activity dimensions';
    assert.equal(rewriteMisclassifiedSignalType('institutional_abandonment_perception', evidence), 'coordination_failure');
    assert.equal(rewriteMisclassifiedSignalType('resource_shortage', evidence), 'coordination_failure');
    assert.equal(
      rewriteMisclassifiedSignalType('institutional_abandonment_perception', 'Residents say the state forgot us in the north'),
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
    assert.equal(out[1].signal_type, 'non_compliance_ignore_guidelines');
    assert.ok(!out[1].evidence.includes('avg='));
  });
});
