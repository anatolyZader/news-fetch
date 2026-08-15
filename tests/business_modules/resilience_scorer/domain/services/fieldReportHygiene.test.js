import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  stripLatinGloss,
  detectVerbatimViolations,
  VERBATIM_VIOLATION,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/hygiene/fieldReportHygiene.js';

describe('stripLatinGloss', () => {
  it('removes a trailing English translation gloss', () => {
    const out = stripLatinGloss('ממ״דים תקועים בבנייה לאורך שנים ( mamads stuck in construction for years)');
    assert.equal(out, 'ממ״דים תקועים בבנייה לאורך שנים');
  });

  it('removes a mid-string gloss and re-collapses whitespace', () => {
    const out = stripLatinGloss('הרפואה בקהילה נפגעה (healthcare impacted), כך גם בתי חולים');
    assert.equal(out, 'הרפואה בקהילה נפגעה, כך גם בתי חולים');
  });

  it('preserves a parenthetical that contains Hebrew', () => {
    const ev = 'קיימת מנהיגות מקומית (צח״י, ועד מקומי ומנהלת קהילה)';
    assert.equal(stripLatinGloss(ev), ev);
  });

  it('preserves a mixed parenthetical holding Hebrew alongside Latin', () => {
    const ev = 'צורך במבנים מוגנים (ממ״ד / mamad)';
    assert.equal(stripLatinGloss(ev), ev);
  });

  it('leaves English-source evidence untouched — there is no Hebrew to protect', () => {
    const ev = 'Fire and Rescue forces are operating at the impact site (Nahariya)';
    assert.equal(stripLatinGloss(ev), ev);
  });

  it('leaves clean Hebrew evidence untouched', () => {
    const ev = 'אין מספיק מקלטים';
    assert.equal(stripLatinGloss(ev), ev);
  });

  it('handles null and empty input', () => {
    assert.equal(stripLatinGloss(null), '');
    assert.equal(stripLatinGloss(undefined), '');
    assert.equal(stripLatinGloss(''), '');
  });
});

describe('detectVerbatimViolations', () => {
  it('names a Latin gloss', () => {
    const out = detectVerbatimViolations('אין מיגון בבית (no protection at home)');
    assert.deepEqual(out, [VERBATIM_VIOLATION.latin_gloss]);
  });

  it('names span concatenation left behind after the gloss is stripped', () => {
    const out = detectVerbatimViolations(
      'אני עובדת בחירום כבר מאז 2020 (working since 2020) + יש תחושת עייפות ושחיקה (burnout)',
    );
    assert.ok(out.includes(VERBATIM_VIOLATION.latin_gloss));
    assert.ok(out.includes(VERBATIM_VIOLATION.span_concatenation));
  });

  it('names elision', () => {
    const out = detectVerbatimViolations('התושבים מגובשים, עובדים בשת״פ... הועד המקומי תומך');
    assert.deepEqual(out, [VERBATIM_VIOLATION.span_elision]);
  });

  it('flags fully-English evidence only when the source document is Hebrew', () => {
    const ev = 'parents with small children lack protective shelters';
    assert.deepEqual(detectVerbatimViolations(ev, { sourceLanguageHebrew: true }), [
      VERBATIM_VIOLATION.no_source_language,
    ]);
    assert.deepEqual(detectVerbatimViolations(ev), []);
  });

  it('returns nothing for clean Hebrew evidence', () => {
    assert.deepEqual(detectVerbatimViolations('אין מספיק מקלטים', { sourceLanguageHebrew: true }), []);
  });

  it('returns nothing for empty input', () => {
    assert.deepEqual(detectVerbatimViolations(''), []);
    assert.deepEqual(detectVerbatimViolations(null), []);
  });
});
