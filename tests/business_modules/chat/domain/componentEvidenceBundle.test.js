import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatComponentEvidenceBundle } from '../../../../business_modules/chat/domain/componentEvidenceBundle.js';
import { buildReportContext } from '../../../../business_modules/chat/domain/reportContext.js';

describe('componentEvidenceBundle', () => {
  const reportData = {
    assessment: {
      date: '2026-04-10',
      user_surface_mode: 'rich',
      components: [{
        component_id: 'leadership',
        narrative_user: 'Leadership narrative paragraph.',
        narrative_claims: [{ text: 'Claim one', signal_refs: ['fear@url:http://x'] }],
        user_investigation_pool: [{
          ref: 'fear@url:http://x',
          evidence: 'Field observation about leadership.',
          user_epistemic_role: 'scored',
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

  it('falls back to structured user evidence when the investigation pool is absent', () => {
    const nonRich = {
      assessment: {
        date: '2026-04-10',
        components: [{
          component_id: 'leadership',
          narrative: 'Narrative.',
          evidence_user_structured: [
            {
              evidence: 'Mayor held nightly briefings in the shelter.',
              signal_type: 'leadership_visible_presence',
              source_type: 'news',
              url: 'https://example.com/a',
            },
            { text: 'Second item via text field.', signal_type: 'leadership_action', source_type: 'visits' },
          ],
        }],
      },
    };
    const parsed = JSON.parse(formatComponentEvidenceBundle(nonRich, 'leadership', {}));
    assert.equal(parsed.evidence_layer, 'evidence_structured');
    assert.equal(parsed.pool_items.length, 2);
    assert.equal(parsed.pool_items[0].signal_type, 'leadership_visible_presence');
    assert.equal(parsed.pool_items[0].url, 'https://example.com/a');
    assert.equal(parsed.pool_items[1].evidence, 'Second item via text field.');
    assert.equal(parsed.pool_summary.total, 2);
  });

  it('bounds the payload: narrative is an excerpt and evidence items are clipped', () => {
    const big = {
      assessment: {
        date: '2026-04-10',
        components: [{
          component_id: 'leadership',
          narrative_user: 'N'.repeat(5000),
          user_investigation_pool: [{
            ref: 'r1',
            evidence: 'E'.repeat(2000),
            user_epistemic_role: 'scored',
            signal_type: 'leadership_action',
            source_type: 'news',
          }],
        }],
      },
    };
    const parsed = JSON.parse(formatComponentEvidenceBundle(big, 'leadership', {}));
    assert.equal(parsed.narrative_excerpt.length, 300);
    assert.equal(parsed.pool_items[0].evidence.length, 350);
    assert.equal(parsed.evidence_layer, 'investigation_pool');
    assert.equal(parsed.pool_items[0].signal_type, 'leadership_action');
  });

  it('orders pool items scored-first so the report basis survives the limit', () => {
    const mixed = {
      assessment: {
        date: '2026-04-10',
        components: [{
          component_id: 'leadership',
          narrative: 'N.',
          user_investigation_pool: [
            { ref: 'q1', evidence: 'quarantined lead', user_epistemic_role: 'quarantined' },
            { ref: 's1', evidence: 'scored basis A', user_epistemic_role: 'scored' },
            { ref: 'c1', evidence: 'context item', user_epistemic_role: 'context_only' },
            { ref: 's2', evidence: 'scored basis B', user_epistemic_role: 'scored' },
          ],
        }],
      },
    };
    const parsed = JSON.parse(formatComponentEvidenceBundle(mixed, 'leadership', { limit: 3 }));
    assert.deepEqual(parsed.pool_items.map((i) => i.ref), ['s1', 's2', 'c1']);
    assert.equal(parsed.pool_summary.by_role.quarantined, 1, 'summary still counts the full pool');
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
