import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { labelStaleFieldVisits } from '../../../../business_modules/resilience_scorer/infrastructure/reportWriter.js';

describe('labelStaleFieldVisits', () => {
  it('appends age to APA field-visit citations at least a week old', () => {
    const out = labelStaleFieldVisits(
      'Routine noted (Field visit, 17 Mar 2026).',
      '2026-03-29',
    );
    assert.equal(out, 'Routine noted (Field visit, 17 Mar 2026 — 12 days old).');
  });

  it('leaves fresh field-visit citations untouched', () => {
    const md = 'Routine noted (Field visit, 27 Mar 2026).';
    assert.equal(labelStaleFieldVisits(md, '2026-03-29'), md);
  });

  it('handles linked evidence-anchor field-visit citations', () => {
    const out = labelStaleFieldVisits(
      'Routine noted ([Field visit](#evidence-narrative-abc), 17 Mar 2026).',
      '2026-03-29',
    );
    assert.equal(out, 'Routine noted ([Field visit](#evidence-narrative-abc), 17 Mar 2026 — 12 days old).');
  });

  it('labels stale visits inside mixed-source parentheticals only', () => {
    const out = labelStaleFieldVisits(
      'Mixed (Field visit, 17 Mar 2026; ynet.co.il, 29 Mar 2026).',
      '2026-03-29',
    );
    assert.equal(out, 'Mixed (Field visit, 17 Mar 2026 — 12 days old; ynet.co.il, 29 Mar 2026).');
  });

  it('does not double-label already-annotated citations', () => {
    const md = 'Routine noted (Field visit, 17 Mar 2026 — 12 days old).';
    assert.equal(labelStaleFieldVisits(md, '2026-03-29'), md);
  });

  it('returns input unchanged without a valid report date', () => {
    const md = 'Routine noted (Field visit, 17 Mar 2026).';
    assert.equal(labelStaleFieldVisits(md, undefined), md);
  });
});
