import { describe, it } from 'node:test';
import assert from 'node:assert';

import { buildReportText, buildReportHtml } from '../../../../business_modules/mailing/app/mailDigestRenderer.js';
import { LABELS } from '../../../../business_modules/mailing/domain/copy/mailingLabels.js';

/**
 * Reports produced by the operator narrative pipeline leave `narrative` and
 * `cross_component_synthesis` empty and write the prose to the `_operator`
 * fields instead. The digest must read those, or every section renders blank.
 */
function operatorSurfaceAssessment() {
  return {
    date: '2026-04-03',
    total_articles_analyzed: 57,
    cross_component_synthesis: '',
    cross_component_synthesis_operator: 'Operator-surface synthesis across the eight components.',
    components: [
      {
        component_id: 'leadership',
        narrative: '',
        narrative_operator: 'Leadership prose written by the operator pipeline.',
        confidence: 'high',
      },
    ],
  };
}

describe('digest renders operator-surface reports', () => {
  const cached = { reportDate: '2026-04-03' };
  const labels = LABELS.en;

  it('shows component prose from narrative_operator', () => {
    const text = buildReportText({ cached, assessment: operatorSurfaceAssessment(), labels, lang: 'en' });
    assert.match(text, /Leadership prose written by the operator pipeline/);
  });

  it('shows the executive summary from cross_component_synthesis_operator', () => {
    const text = buildReportText({ cached, assessment: operatorSurfaceAssessment(), labels, lang: 'en' });
    assert.match(text, /Operator-surface synthesis across the eight components/);
    assert.doesNotMatch(text, /No executive summary/);
  });

  it('renders both in the HTML body, with no empty placeholder paragraphs', () => {
    const html = buildReportHtml({ cached, assessment: operatorSurfaceAssessment(), labels, lang: 'en', dir: 'ltr' });
    assert.match(html, /Leadership prose written by the operator pipeline/);
    assert.match(html, /Operator-surface synthesis across the eight components/);
    assert.ok(!html.includes('<em>—</em>'), 'no component should fall back to the empty-value dash');
  });

  it('still honours the plain narrative field when there is no operator surface', () => {
    const assessment = {
      date: '2026-04-03',
      cross_component_synthesis: 'Legacy synthesis.',
      components: [{ component_id: 'leadership', narrative: 'Legacy leadership prose.', confidence: 'high' }],
    };
    const text = buildReportText({ cached, assessment, labels, lang: 'en' });
    assert.match(text, /Legacy leadership prose/);
    assert.match(text, /Legacy synthesis/);
  });

  it('falls back to the no-summary label when neither synthesis field has text', () => {
    const assessment = { date: '2026-04-03', components: [] };
    const text = buildReportText({ cached, assessment, labels, lang: 'en' });
    assert.match(text, /No executive summary/);
  });

  it('carries the current brand in the header', () => {
    const html = buildReportHtml({ cached, assessment: operatorSurfaceAssessment(), labels, lang: 'en', dir: 'ltr' });
    assert.match(html, /Srulik's Lab/);
    assert.ok(!html.includes('Vibes Witch'));
  });
});
