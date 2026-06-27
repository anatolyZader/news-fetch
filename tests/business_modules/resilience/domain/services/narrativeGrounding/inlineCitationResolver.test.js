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
