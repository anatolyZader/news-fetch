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

  it('resolves standalone [S#] to markdown links', () => {
    const registry = buildSignalRefRegistry(scored);
    const out = resolveInlineSignalCitations(
      'Residents report fear [S1].',
      registry,
    );
    assert.match(out, /\[ynet\.co\.il\]\(https:\/\/www\.ynet\.co\.il\/news\/1\)/);
    assert.doesNotMatch(out, /\[S1\]/);
  });

  it('resolves grouped parenthetical signal refs', () => {
    const registry = buildSignalRefRegistry(scored);
    const out = resolveInlineSignalCitations(
      'Observations ([S1], [S2]) suggest tension.',
      registry,
    );
    assert.match(out, /ynet\.co\.il/);
    assert.match(out, /haaretz\.co\.il/);
    assert.doesNotMatch(out, /\[S\d+\]/);
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
    const out = resolveInlineSignalCitations('Thin note [S1].', registry);
    assert.equal(out, 'Thin note.');
  });
});
