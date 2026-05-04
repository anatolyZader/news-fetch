import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createOverridesStore } from '../../../../business_modules/resilience/infrastructure/overridesStore.js';
import { createOverridesService } from '../../../../business_modules/resilience/app/overridesService.js';

let tmp;
let service;

beforeEach(() => {
  tmp = mkdtempSync(resolve(tmpdir(), 'overrides-svc-'));
  service = createOverridesService({ store: createOverridesStore({ baseDir: tmp }) });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('overridesService.validate', () => {
  function expectErrors(input, ...expected) {
    const errs = service.validate(input);
    for (const e of expected) {
      assert.ok(errs.includes(e), `expected error '${e}' in: ${JSON.stringify(errs)}`);
    }
  }

  it('rejects missing uid / bad date / bad component_id / bad kind', () => {
    expectErrors({}, 'uid_required', 'report_date_invalid', 'component_id_invalid', 'kind_invalid');
    expectErrors({ uid: 'u', report_date: '2026/05/03', component_id: 'narrative', kind: 'challenge_score',
      proposed: { score: 5 } }, 'report_date_invalid');
    expectErrors({ uid: 'u', report_date: '2026-05-03', component_id: 'unknown', kind: 'challenge_score',
      proposed: { score: 5 } }, 'component_id_invalid');
    expectErrors({ uid: 'u', report_date: '2026-05-03', component_id: 'narrative', kind: 'unknown_kind' },
      'kind_invalid');
  });

  it('rejects challenge_score with out-of-range or non-integer proposed score', () => {
    expectErrors({ uid: 'u', report_date: '2026-05-03', component_id: 'narrative', kind: 'challenge_score',
      proposed: { score: 0 } }, 'proposed_score_invalid');
    expectErrors({ uid: 'u', report_date: '2026-05-03', component_id: 'narrative', kind: 'challenge_score',
      proposed: { score: 11 } }, 'proposed_score_invalid');
    expectErrors({ uid: 'u', report_date: '2026-05-03', component_id: 'narrative', kind: 'challenge_score',
      proposed: { score: 5.5 } }, 'proposed_score_invalid');
    expectErrors({ uid: 'u', report_date: '2026-05-03', component_id: 'narrative', kind: 'challenge_score' },
      'proposed_score_invalid');
  });

  it('rejects note longer than 500 chars', () => {
    const long = 'a'.repeat(501);
    expectErrors({ uid: 'u', report_date: '2026-05-03', component_id: 'narrative', kind: 'challenge_score',
      proposed: { score: 5 }, note: long }, 'note_too_long');
  });

  it('accepts a valid challenge_score override', () => {
    const errs = service.validate({
      uid: 'u', report_date: '2026-05-03', component_id: 'narrative', kind: 'challenge_score',
      proposed: { score: 5 }, original: { score: 7 }, note: 'thin evidence',
    });
    assert.deepEqual(errs, []);
  });

  it('accepts a dispute_evidence override (no proposed score required)', () => {
    const errs = service.validate({
      uid: 'u', report_date: '2026-05-03', component_id: 'leadership', kind: 'dispute_evidence',
      note: 'evidence looks like satire',
    });
    assert.deepEqual(errs, []);
  });

  it('A8: rejects the deprecated flag_signal kind', () => {
    const errs = service.validate({
      uid: 'u', report_date: '2026-05-03', component_id: 'leadership', kind: 'flag_signal',
      note: 'should be rejected now',
    });
    assert.ok(errs.includes('kind_invalid'));
  });
});

describe('overridesService.create + list + countByComponent', () => {
  it('creates valid records and exposes them via list / countByComponent', () => {
    const a = service.create({
      uid: 'u1', email: 'a@x', report_date: '2026-05-03', scope: 'national',
      component_id: 'narrative', kind: 'challenge_score', proposed: { score: 4 }, original: { score: 7 },
    });
    const b = service.create({
      uid: 'u2', email: 'b@x', report_date: '2026-05-03', scope: 'national',
      component_id: 'narrative', kind: 'dispute_evidence',
    });
    assert.ok(a.id && b.id);

    const list = service.list({ date: '2026-05-03', scope: 'national' });
    assert.equal(list.length, 2);

    const counts = service.countByComponent({ date: '2026-05-03', scope: 'national' });
    assert.equal(counts.narrative, 2);
  });

  it('throws validation_failed with details on bad input', () => {
    assert.throws(
      () => service.create({ uid: 'u', report_date: 'bad', component_id: 'narrative', kind: 'challenge_score',
        proposed: { score: 5 } }),
      (err) => err.code === 'validation_failed' && err.details?.includes('report_date_invalid'),
    );
  });

  it('throws date_invalid on list with bad date', () => {
    assert.throws(
      () => service.list({ date: 'not-a-date' }),
      (err) => err.code === 'date_invalid',
    );
  });
});
