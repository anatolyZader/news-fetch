import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FILTER_PRESETS,
  filterReportComponents,
} from '../../../client/src/lib/reportComponentFilter.js';

describe('reportComponentFilter', () => {
  const components = [
    { component_id: 'narrative', instrument: { evidence_sufficiency: 'adequate', contested: true } },
    { component_id: 'leadership', instrument: { evidence_sufficiency: 'thin' } },
    { component_id: 'wellbeing_at_risk', instrument: { evidence_sufficiency: 'adequate' } },
  ];

  it('returns all by default', () => {
    assert.equal(filterReportComponents(components, { preset: FILTER_PRESETS.all }).length, 3);
  });

  it('filters thin components', () => {
    const out = filterReportComponents(components, { preset: FILTER_PRESETS.thin });
    assert.deepEqual(out.map((c) => c.component_id), ['leadership']);
  });

  it('filters contested components', () => {
    const out = filterReportComponents(components, { preset: FILTER_PRESETS.contested });
    assert.deepEqual(out.map((c) => c.component_id), ['narrative']);
  });

  it('filters by selected component ids', () => {
    const out = filterReportComponents(components, {
      preset: FILTER_PRESETS.all,
      selectedComponentIds: ['narrative', 'leadership'],
    });
    assert.equal(out.length, 2);
  });
});
