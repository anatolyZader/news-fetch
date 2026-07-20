import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatComponentEvidenceBundle } from '../../../../business_modules/chat/domain/componentEvidenceBundle.js';
import { buildReportContext } from '../../../../business_modules/chat/domain/reportContext.js';

describe('componentEvidenceBundle', () => {
  const reportData = {
    assessment: {
      date: '2026-04-10',
      operator_surface_mode: 'rich',
      components: [{
        component_id: 'leadership',
        narrative_operator: 'Leadership narrative paragraph.',
        narrative_claims: [{ text: 'Claim one', signal_refs: ['fear@url:http://x'] }],
        operator_investigation_pool: [{
          ref: 'fear@url:http://x',
          evidence: 'Field observation about leadership.',
          operator_epistemic_role: 'scored',
          source_type: 'visits',
        }],
      }],
    },
  };

  it('formatComponentEvidenceBundle returns JSON with pool items', () => {
    const out = formatComponentEvidenceBundle(reportData, 'leadership', { limit: 10 });
    const parsed = JSON.parse(out);
    assert.equal(parsed.component_id, 'leadership');
    assert.equal(parsed.pool_items.length, 1);
    assert.equal(parsed.claims.length, 1);
  });

  it('buildReportContext component slice includes pool summary in rich mode', () => {
    const { context } = buildReportContext(reportData, {
      contextSlice: 'component',
      componentId: 'leadership',
    });
    assert.match(context, /Investigation pool/);
    assert.match(context, /get_component_evidence_bundle/);
  });
});
