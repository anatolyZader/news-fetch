import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatReadableCitations,
  formatReportMarkdown,
  formatReportDateLabel,
  labelFromUrl,
} from '../../../client/src/lib/formatSourceCitations.js';

describe('formatSourceCitations', () => {
  it('formats named source with report date', () => {
    const out = formatReadableCitations(
      'Residents report disruption ([Ynet](https://www.ynet.co.il/article)).',
      '2026-06-20',
    );
    assert.match(out, /\(Ynet, 20 Jun 2026\)/);
  });

  it('derives label from URL when link text is generic source', () => {
    const out = formatReadableCitations(
      'Observation ([source](https://www.ynet.co.il/story)).',
      '2026-06-20',
    );
    assert.match(out, /\(ynet\.co\.il, 20 Jun 2026\)/);
  });

  it('formatReportMarkdown chains expandLinks then parentheticals', () => {
    const out = formatReportMarkdown(
      'Quote ([source](https://example.com/a)).',
      '2026-06-01',
      (md) => md.replace('[source](https://example.com/a)', '[Example](https://example.com/a)'),
    );
    assert.match(out, /\(Example, 01 Jun 2026\)/);
  });

  it('formatReportDateLabel returns empty for invalid input', () => {
    assert.equal(formatReportDateLabel(null), '');
    assert.equal(formatReportDateLabel('bad'), '');
  });

  it('labelFromUrl falls back to hostname', () => {
    assert.equal(labelFromUrl('https://www.haaretz.co.il/news'), 'haaretz.co.il');
  });
});
