import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeAssessmentEvidenceTool } from '../../../cross-cut-modules/retrieval/assessmentEvidenceTools.js';

describe('assessmentEvidenceTools', () => {
  it('lookup_signals searches in-memory signals', async () => {
    const raw = await executeAssessmentEvidenceTool('lookup_signals', {
      query: 'shelter',
      component: 'lifesaving_behavior',
      limit: 5,
    }, {
      signals: [{
        signal_type: 'compliance_enter_shelter',
        source_type: 'visits',
        evidence: 'Residents used shelter during alert',
        component: 'leadership',
      }],
      reportDate: '2026-06-01',
    });
    const parsed = JSON.parse(raw);
    assert.ok(parsed.result.includes('shelter') || parsed.result.includes('Shelter'));
  });

  it('get_source graceful when archive null', async () => {
    const raw = await executeAssessmentEvidenceTool('get_source', {
      source_id: 'archive:news:1',
    }, { sourceArchive: null, reportDate: '2026-06-01' });
    const parsed = JSON.parse(raw);
    assert.ok(String(parsed.result).includes('not available'));
  });
});
