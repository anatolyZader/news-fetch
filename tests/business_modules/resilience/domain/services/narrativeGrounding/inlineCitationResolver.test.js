import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildSignalRefRegistry } from '../../../../../../business_modules/resilience/domain/services/narrativeGrounding/signalRefRegistry.js';
import { resolveInlineSignalCitations } from '../../../../../../business_modules/resilience/domain/services/narrativeGrounding/inlineCitationResolver.js';

describe('inlineCitationResolver', () => {
  const scored = {
    narrative: {
      signals: [
        {
          signal_type: 'fear_expression',
          article_url: 'https://www.ynet.co.il/news/1',
          article_source: 'ynet.co.il',
          evidence: 'Residents report fear.',
        },
        {
          signal_type: 'compliance_enter_shelter',
          article_url: 'https://www.haaretz.co.il/news/2',
          article_source: 'haaretz.co.il',
          evidence: 'Shelter use is high.',
        },
      ],
    },
  };

  const reportDate = '2026-04-12';

  it('resolves standalone [S#] to APA parenthetical with date', () => {
    const registry = buildSignalRefRegistry(scored);
    const out = resolveInlineSignalCitations(
      'Residents report fear [S1].',
      registry,
      reportDate,
    );
    assert.equal(out, 'Residents report fear (ynet.co.il, 12 Apr 2026).');
    assert.doesNotMatch(out, /\[S1\]/);
  });

  it('resolves grouped parenthetical signal refs with date', () => {
    const registry = buildSignalRefRegistry(scored);
    const out = resolveInlineSignalCitations(
      'Observations ([S1], [S2]) suggest tension.',
      registry,
      reportDate,
    );
    assert.match(out, /ynet\.co\.il, 12 Apr 2026/);
    assert.match(out, /haaretz\.co\.il, 12 Apr 2026/);
    assert.doesNotMatch(out, /\[S\d+\]/);
  });

  it('converts markdown links to APA with date', () => {
    const registry = buildSignalRefRegistry(scored);
    const out = resolveInlineSignalCitations(
      'Coverage [Ynet](https://www.ynet.co.il/news/1) noted disruption.',
      registry,
      reportDate,
    );
    assert.equal(out, 'Coverage (Ynet, 12 Apr 2026) noted disruption.');
  });

  it('converts markdown links to linked APA with domain when text is a URL', () => {
    const registry = buildSignalRefRegistry(scored);
    const out = resolveInlineSignalCitations(
      'Coverage [https://www.ynet.co.il/news/1](https://www.ynet.co.il/news/1) noted disruption.',
      registry,
      reportDate,
      { linked: true },
    );
    assert.match(out, /\(\[ynet\.co\.il\]\(https:\/\/www\.ynet\.co\.il\/news\/1\), 12 Apr 2026\)/);
  });

  it('resolves bracketed internal @idx refs to Field visit APA', () => {
    const registry = buildSignalRefRegistry({
      narrative: {
        signals: [{
          signal_type: 'resilience_narrative_positive',
          source_type: 'field',
          article_index: 7,
          evidence: 'Routine returning.',
        }],
      },
    });
    const ref = registry.byComponent.narrative[0].ref;
    const out = resolveInlineSignalCitations(
      `Routine is evident [${ref}].`,
      registry,
      '2026-04-02',
    );
    assert.equal(out, 'Routine is evident (Field visit, 02 Apr 2026).');
    assert.doesNotMatch(out, /@idx:/);
  });

  it('resolves bracketed internal @url refs to evidence anchor APA', () => {
    const registry = buildSignalRefRegistry(scored);
    const ref = registry.byComponent.narrative[0].ref;
    const out = resolveInlineSignalCitations(
      `Fear noted [${ref}].`,
      registry,
      reportDate,
      { linked: true, linkMode: 'evidence', componentId: 'narrative' },
    );
    assert.match(out, /\[ynet\.co\.il\]\(#evidence-narrative-/);
    assert.match(out, /12 Apr 2026/);
  });

  it('resolves bracketed internal @idx refs to evidence anchor for field visit', () => {
    const registry = buildSignalRefRegistry({
      narrative: {
        signals: [{
          signal_type: 'resilience_narrative_positive',
          source_type: 'field',
          article_index: 7,
          evidence: 'Routine returning.',
        }],
      },
    });
    const ref = registry.byComponent.narrative[0].ref;
    const out = resolveInlineSignalCitations(
      `Routine is evident [${ref}].`,
      registry,
      '2026-04-02',
      { linked: true, linkMode: 'evidence', componentId: 'narrative' },
    );
    assert.match(out, /\[Field visit\]\(#evidence-narrative-/);
    assert.doesNotMatch(out, /@idx:/);
  });

  it('drops refs without URLs', () => {
    const registry = buildSignalRefRegistry({
      narrative: {
        signals: [{
          signal_type: 'note',
          evidence: 'No link signal.',
        }],
      },
    });
    const out = resolveInlineSignalCitations('Thin note [S1].', registry, reportDate);
    assert.equal(out, 'Thin note.');
  });
});
