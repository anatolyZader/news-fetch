import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPopulationBehaviorSignal,
  isHomefrontBehaviorRelevant,
  isPureAlertTemplate,
} from '../../../../../business_modules/social_media/domain/services/homefrontBehaviorFilter.js';

describe('homefrontBehaviorFilter', () => {
  const municipalChannel = {
    sourceCategory: 'official_municipal_updates',
    citizenVoiceLevel: 'low',
  };

  const fieldChannel = {
    sourceCategory: 'field_reports_aggregator',
    citizenVoiceLevel: 'medium',
  };

  it('accepts resident sheltering behavior', () => {
    const text = 'אזעקה בנהריה — תושבים נכנסים למקלט בבניינים';
    assert.ok(isHomefrontBehaviorRelevant(text, municipalChannel));
    assert.ok(hasPopulationBehaviorSignal(text));
  });

  it('rejects pure alert templates without population behavior', () => {
    const text = 'אזעקה בגליל המערבי';
    assert.ok(isPureAlertTemplate(text));
    assert.equal(isHomefrontBehaviorRelevant(text, municipalChannel), false);
  });

  it('rejects generic municipal announcement without behavior on official channels', () => {
    const text = 'עיריית נהריה מודיעה: אזעקה נשמעה באזור. יש להישמע להנחיות פיקוד העורף.';
    assert.equal(isHomefrontBehaviorRelevant(text, municipalChannel), false);
  });

  it('accepts municipal post describing resident compliance gap', () => {
    const text = 'עיריית נהריה: תושבים מתבקשים להיכנס למרחב מוגן — דלתות הבניינים חייבות להיות פתוחות';
    assert.ok(isHomefrontBehaviorRelevant(text, municipalChannel));
  });

  it('accepts field report with resident voice on medium-voice channel', () => {
    const text = 'תושבים מדווחים ממטולה: שמענו פיצוצים ויש חרדה בקרב משפחות';
    assert.ok(isHomefrontBehaviorRelevant(text, fieldChannel));
  });

  it('rejects unrelated general content even with homefront keyword elsewhere', () => {
    const text = 'מבצע צה"ל בעזה — תקיפה על מטרות טרור';
    assert.equal(isHomefrontBehaviorRelevant(text, fieldChannel), false);
  });

  it('rejects IDF military ops news repost on strict channels', () => {
    const news360Channel = {
      sourceCategory: 'field_reports_and_public_discussion',
      citizenVoiceLevel: 'medium',
      doNotUseFor: ['news/editorial content'],
      collectionNotes: 'Use strict filters: reject general news reposts.',
    };
    const text = 'פרטים חדשים על חיסול המחבלים הלילה בדרום לבנון: תצפיות צה"ל זיהו שני מחבלים. מטוס קרב הטיל פצצה. בצה"ל הכריזו על חזרה לשגרה. חדשות 360 | קבוצת הדיונים';
    assert.equal(isHomefrontBehaviorRelevant(text, news360Channel), false);
  });

  it('rejects UAV attack alert templates even when topic is uav-focused', () => {
    const news360Channel = {
      sourceCategory: 'field_reports_and_public_discussion',
      citizenVoiceLevel: 'medium',
      doNotUseFor: ['news/editorial content'],
      collectionNotes: 'Use strict filters: reject general news reposts.',
    };
    const alert = '✈️ חדירת כלי טיס עוין (22/05/2026):\n15:07:\n• קו העימות: שתולה\n\nצופר - צבע אדום';
    const idfAlert = 'דובר צה"ל:\n\nהופעלו התרעות על חדירת כלי טיס עוין במרחב נטועה';
    assert.equal(isHomefrontBehaviorRelevant(alert, news360Channel, { topic: 'כטב"ם' }), false);
    assert.equal(isHomefrontBehaviorRelevant(idfAlert, news360Channel, { topic: 'uav danger' }), false);
  });

  it('accepts UAV topic posts that describe population behavior', () => {
    const fieldChannel = {
      sourceCategory: 'field_reports_aggregator',
      citizenVoiceLevel: 'medium',
    };
    const text = 'תושבים מדווחים מנהריה: אחרי חדירת כלי טיס — רבים נכנסים למקלט, יש חרדה בקרב משפחות';
    assert.ok(isHomefrontBehaviorRelevant(text, fieldChannel, { topic: 'כטב"ם' }));
  });
});
