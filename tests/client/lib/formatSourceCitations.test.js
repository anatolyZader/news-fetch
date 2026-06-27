import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatReadableCitations,
  formatReportMarkdown,
  formatReportDateLabel,
  labelFromUrl,
  formatAcademicSignalRefs,
  formatLinkedReadableCitations,
  formatNarrativeMarkdown,
  formatEvidenceCitations,
  formatEvidenceMarkdown,
} from '../../../client/src/lib/formatSourceCitations.js';

describe('formatSourceCitations', () => {
  it('formats named source with APA date parenthetical', () => {
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

  it('formatReportMarkdown chains expandLinks then APA parentheticals', () => {
    const out = formatReportMarkdown(
      'Quote ([source](https://example.com/a)).',
      '2026-06-01',
      (md) => md.replace('[source](https://example.com/a)', '[Example](https://example.com/a)'),
    );
    assert.match(out, /\(Example, 01 Jun 2026\)/);
  });

  it('formatReportDateLabel returns APA citation date', () => {
    assert.equal(formatReportDateLabel('2026-04-12'), '12 Apr 2026');
    assert.equal(formatReportDateLabel(null), '');
    assert.equal(formatReportDateLabel('bad'), '');
  });

  it('labelFromUrl falls back to hostname', () => {
    assert.equal(labelFromUrl('https://www.haaretz.co.il/news'), 'haaretz.co.il');
  });

  it('formatAcademicSignalRefs groups consecutive [S#] refs', () => {
    const out = formatAcademicSignalRefs(
      'Residents report relief [S5][S19][S37].',
    );
    assert.equal(out, 'Residents report relief ([S5],[S19],[S37]).');
  });

  it('formatAcademicSignalRefs normalizes spaced parenthetical groups', () => {
    const out = formatAcademicSignalRefs('Fatigue noted ([S13], [S55], [S61]).');
    assert.equal(out, 'Fatigue noted ([S13],[S55],[S61]).');
  });

  it('formatAcademicSignalRefs leaves markdown links unchanged', () => {
    const md = 'See ([Ynet](https://www.ynet.co.il/article)).';
    assert.equal(formatAcademicSignalRefs(md), md);
  });

  it('formatNarrativeMarkdown applies academic signal refs only', () => {
    const out = formatNarrativeMarkdown('Coping [S1][S2].');
    assert.equal(out, 'Coping ([S1],[S2]).');
  });

  it('formatLinkedReadableCitations uses APA date with linked author', () => {
    const out = formatLinkedReadableCitations(
      'Residents report disruption ([Ynet](https://www.ynet.co.il/article)).',
      '2026-06-20',
    );
    assert.match(out, /\(\[Ynet\]\(https:\/\/www\.ynet\.co\.il\/article\), 20 Jun 2026\)/);
  });

  it('formatLinkedReadableCitations derives hostname for generic source', () => {
    const out = formatLinkedReadableCitations(
      'Observation ([source](https://www.ynet.co.il/story)).',
      '2026-06-20',
    );
    assert.match(out, /\(\[ynet\.co\.il\]\(https:\/\/www\.ynet\.co\.il\/story\), 20 Jun 2026\)/);
  });

  it('formatNarrativeMarkdown renders APA parentheticals with full date', () => {
    const out = formatNarrativeMarkdown(
      'Residents report relief [Ynet](https://www.ynet.co.il/article).',
      '2026-04-12',
    );
    assert.match(out, /\(\[Ynet\]\(https:\/\/www\.ynet\.co\.il\/article\), 12 Apr 2026\)/);
    assert.doesNotMatch(out, /\[S\d+\]/);
  });

  it('formatNarrativeMarkdown merges multiple sources into one APA parenthetical', () => {
    const out = formatNarrativeMarkdown(
      'Relief [Ynet](https://www.ynet.co.il/a) [Haaretz](https://www.haaretz.co.il/b).',
      '2026-04-12',
    );
    assert.match(out, /12 Apr 2026; \[Haaretz\]/);
  });

  it('formatNarrativeMarkdown leaves pre-formatted APA unchanged', () => {
    const out = formatNarrativeMarkdown(
      'Already cited (Ynet, 12 Apr 2026).',
      '2026-04-12',
    );
    assert.equal(out, 'Already cited (Ynet, 12 Apr 2026).');
  });

  it('formatEvidenceCitations renders linked APA citations with date', () => {
    const out = formatEvidenceCitations(
      'Quote [https://tiktok.com/x](https://tiktok.com/x).',
      '2026-05-23',
    );
    assert.match(out, /\(\[https:\/\/tiktok\.com\/x\]\(https:\/\/tiktok\.com\/x\), 23 May 2026\)/);
  });

  it('formatEvidenceMarkdown chains expandLinks then APA citations', () => {
    const out = formatEvidenceMarkdown(
      'Quote [source](https://example.com/a).',
      '2026-06-01',
      (md) => md.replaceAll(/\[source\]\((https?:[^)\s]+)\)/gi, (_, url) => `[${url}](${url})`),
    );
    assert.match(out, /\(\[https:\/\/example\.com\/a\]\(https:\/\/example\.com\/a\), 01 Jun 2026\)/);
  });

  it('formatEvidenceMarkdown uses hostname for generic source citations', () => {
    const out = formatEvidenceMarkdown(
      'Quote [source](https://example.com/a).',
      '2026-06-01',
    );
    assert.match(out, /\(\[example\.com\]\(https:\/\/example\.com\/a\), 01 Jun 2026\)/);
  });
});
