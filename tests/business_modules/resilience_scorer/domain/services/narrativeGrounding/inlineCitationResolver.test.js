import { describe, it } from 'node:test';
import { strict as assert } from 'assert';

import { buildSignalRefRegistry } from '../../../../../../business_modules/resilience_scorer/domain/services/narrative/signalRefRegistry.js';
import { resolveInlineSignalCitations } from '../../../../../../business_modules/resilience_scorer/domain/contracts/inlineCitationResolve.js';

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
          source_type: 'visits',
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
          source_type: 'visits',
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

  it('uses the visit date, not the report date, for field-visit citations', () => {
    const registry = buildSignalRefRegistry({
      narrative: {
        signals: [{
          signal_type: 'resilience_narrative_positive',
          source_type: 'visits',
          article_index: 7,
          evidence: 'Routine returning.',
          visit_date: '2026-03-17',
          signal_age_days: 12,
        }],
      },
    });
    const ref = registry.byComponent.narrative[0].ref;
    const out = resolveInlineSignalCitations(
      `Routine is evident [${ref}].`,
      registry,
      '2026-03-29',
    );
    assert.equal(out, 'Routine is evident (Field visit, 17 Mar 2026).');
  });

  it('mixes per-source visit dates with report-dated press in one group', () => {
    const registry = buildSignalRefRegistry({
      narrative: {
        signals: [
          {
            signal_type: 'fear_expression',
            article_url: 'https://www.ynet.co.il/news/1',
            article_source: 'ynet.co.il',
            evidence: 'Residents report fear.',
          },
          {
            signal_type: 'resilience_narrative_positive',
            source_type: 'visits',
            article_index: 3,
            evidence: 'Routine returning.',
            visit_date: '2026-04-01',
            signal_age_days: 11,
          },
        ],
      },
    });
    const out = resolveInlineSignalCitations(
      'Mixed picture ([S1], [S2]).',
      registry,
      reportDate,
    );
    assert.match(out, /ynet\.co\.il, 12 Apr 2026/);
    assert.match(out, /Field visit, 01 Apr 2026/);
  });

  it('round-trips visit dates through the stored citation registry', async () => {
    const { buildCitationRegistryFromStored } = await import(
      '../../../../../../business_modules/resilience_scorer/domain/contracts/citationDisplay.js'
    );
    const stored = buildCitationRegistryFromStored([{
      label: 'S1',
      ref: 'resilience_narrative_positive@idx:3',
      article_source: 'field-team-2',
      article_url: null,
      source_type: 'visits',
      signal_date: '2026-04-01',
    }]);
    const out = resolveInlineSignalCitations('Routine noted [S1].', stored, reportDate);
    assert.equal(out, 'Routine noted (Field visit, 01 Apr 2026).');
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
