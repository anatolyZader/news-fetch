import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalizeTeamName } from '../../../../business_modules/visits/domain/teamIdentity.js';

describe('canonicalizeTeamName', () => {
  it('resolves permuted member order to one identity', () => {
    // Both spellings appear in the same source spreadsheet for the same team.
    assert.equal(
      canonicalizeTeamName("אנג'ל מנגוני וכארם שוקור"),
      canonicalizeTeamName("כארם שוקור ואנג'ל מנגוני"),
    );
  });

  it('handles the + and comma separators the sheet also uses', () => {
    const plus = canonicalizeTeamName('נאיל + אריאל');
    assert.equal(canonicalizeTeamName('אריאל + נאיל'), plus);
    assert.equal(canonicalizeTeamName('יוסף עראידה, מארק גרמן יעקובוב'), canonicalizeTeamName('מארק גרמן יעקובוב ויוסף עראידה'));
  });

  it('leaves a single-member team as written, minus stray whitespace', () => {
    assert.equal(canonicalizeTeamName('  עלי   זנגריה '), 'עלי זנגריה');
  });

  it('returns null for an empty cell so the caller can apply its own default', () => {
    assert.equal(canonicalizeTeamName(''), null);
    assert.equal(canonicalizeTeamName(null), null);
    assert.equal(canonicalizeTeamName('   '), null);
  });

  it('keeps a leading vav that belongs to the name, not to a conjunction', () => {
    // The conjunction is only a separator when whitespace precedes it; without
    // that guard this pair canonicalises to "איתמר + לדימיר" and loses a letter.
    assert.equal(canonicalizeTeamName('ולדימיר'), 'ולדימיר');
    assert.equal(canonicalizeTeamName('ולדימיר ואיתמר'), 'איתמר + ולדימיר');
  });
});
