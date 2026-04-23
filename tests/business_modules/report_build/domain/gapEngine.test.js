import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeGaps, isSufficient, mergeStructured } from '../../../../business_modules/report_build/domain/gapEngine.js';

describe('report_build gapEngine', () => {
  it('isSufficient is false when universal fields missing', () => {
    const structured = {
      observation: { locality: null, behavior: null, spread: null, sourceBasis: null },
      componentLinks: [],
    };
    assert.strictEqual(isSufficient(structured), false);
  });

  it('isSufficient is true when universal fields and at least one component link exist', () => {
    const structured = {
      observation: { locality: 'אשדוד', behavior: 'אנשים לא נכנסים למרחב מוגן', spread: 'noticeable', sourceBasis: 'direct' },
      componentLinks: [{ componentId: 'lifesaving_behavior', direction: 'negative', rationale: 'תצפית בשטח' }],
    };
    assert.strictEqual(isSufficient(structured), true);
  });

  it('computeGaps returns universal gaps first', () => {
    const structured = { observation: { locality: null, behavior: null, spread: null, sourceBasis: null }, componentLinks: [] };
    const { sufficient, rankedGaps } = computeGaps(structured);
    assert.strictEqual(sufficient, false);
    assert.ok(rankedGaps.length >= 4);
    assert.strictEqual(rankedGaps[0].kind, 'universal');
    assert.strictEqual(rankedGaps[1].kind, 'universal');
  });

  it('mergeStructured overlays new non-empty fields and de-dupes componentLinks', () => {
    const prev = {
      observation: { locality: 'אילת', behavior: 'ישן', spread: 'isolated', sourceBasis: 'staff' },
      componentLinks: [{ componentId: 'lifesaving_behavior', direction: 'negative', rationale: 'old' }],
    };
    const next = {
      observation: { behavior: 'חדש' },
      componentLinks: [{ componentId: 'lifesaving_behavior', direction: 'mixed', rationale: 'new' }],
    };
    const merged = mergeStructured(prev, next);
    assert.strictEqual(merged.observation.locality, 'אילת');
    assert.strictEqual(merged.observation.behavior, 'חדש');
    assert.strictEqual(Array.isArray(merged.componentLinks), true);
    assert.strictEqual(merged.componentLinks.length, 1);
    assert.strictEqual(merged.componentLinks[0].rationale, 'new');
  });
});

