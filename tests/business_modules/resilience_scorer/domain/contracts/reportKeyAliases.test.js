import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  hasLegacyReportKeys,
  canonicalReportKey,
  applyReportKeyAliases,
  parseReportWithAliases,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/reportKeyAliases.js';

describe('reportKeyAliases — detection', () => {
  it('detects legacy keys anywhere in the raw text', () => {
    assert.equal(hasLegacyReportKeys('{"narrative_operator":"x"}'), true);
    assert.equal(hasLegacyReportKeys('{"a":{"analyst_flags":[]}}'), true);
    assert.equal(hasLegacyReportKeys('{"narrative_user":"x"}'), false);
  });

  it('does not fire on the words appearing in values', () => {
    // Only keys are aliased; prose that mentions an operator must not trigger
    // a full walk of a multi-megabyte report.
    assert.equal(hasLegacyReportKeys('{"narrative":"the operator said"}'), false);
  });
});

describe('reportKeyAliases — key mapping', () => {
  it('rewrites the substring wherever it sits in the key', () => {
    assert.equal(canonicalReportKey('operator_status'), 'user_status');
    assert.equal(canonicalReportKey('narrative_operator'), 'narrative_user');
    assert.equal(canonicalReportKey('cross_component_synthesis_operator'), 'cross_component_synthesis_user');
    assert.equal(canonicalReportKey('analyst_flags'), 'developer_flags');
  });

  it('leaves already-canonical keys alone', () => {
    assert.equal(canonicalReportKey('narrative_user'), 'narrative_user');
    assert.equal(canonicalReportKey('signals'), 'signals');
  });
});

describe('reportKeyAliases — aliasing walk', () => {
  it('aliases keys at every depth, including inside arrays', () => {
    const out = applyReportKeyAliases({
      assessment: { components: [{ operator_status: 'ok', narrative_operator: 'p' }] },
    });
    assert.deepEqual(out.assessment.components[0], { user_status: 'ok', narrative_user: 'p' });
  });

  it('keeps the canonical value when both keys are present', () => {
    // Renaming over a live key would replace current data with its superseded
    // twin — the one failure mode that would silently corrupt a report.
    const out = applyReportKeyAliases({ operator_status: 'stale', user_status: 'current' });
    assert.deepEqual(out, { user_status: 'current' });
  });

  it('does not mutate its input', () => {
    const input = { operator_status: 'ok' };
    applyReportKeyAliases(input);
    assert.deepEqual(input, { operator_status: 'ok' });
  });

  it('preserves values, arrays and nulls untouched', () => {
    const out = applyReportKeyAliases({ signals: [1, 2], nothing: null, note: 'operator text' });
    assert.deepEqual(out, { signals: [1, 2], nothing: null, note: 'operator text' });
  });
});

describe('reportKeyAliases — parse', () => {
  it('aliases a legacy report on read', () => {
    const parsed = parseReportWithAliases('{"assessment":{"operator_status":"ok"}}');
    assert.deepEqual(parsed, { assessment: { user_status: 'ok' } });
  });

  it('returns a migrated report unchanged', () => {
    const text = '{"assessment":{"user_status":"ok"},"signals":[]}';
    assert.deepEqual(parseReportWithAliases(text), JSON.parse(text));
  });
});
