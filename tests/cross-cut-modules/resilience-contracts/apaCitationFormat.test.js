import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatApaCitationDate,
  formatApaCitationsInMarkdown,
  formatApaParenthetical,
  apaAuthorLabel,
} from '../../../cross-cut-modules/resilience-contracts/apaCitationFormat.js';

describe('apaCitationFormat', () => {
  it('formatApaCitationDate returns DD Mon YYYY', () => {
    assert.equal(formatApaCitationDate('2026-04-12'), '12 Apr 2026');
    assert.equal(formatApaCitationDate('bad'), '');
  });

  it('formatApaParenthetical uses semicolons for multiple sources', () => {
    const out = formatApaParenthetical(
      [{ author: 'Ynet' }, { author: 'Haaretz' }],
      '12 Apr 2026',
    );
    assert.equal(out, '(Ynet, 12 Apr 2026; Haaretz, 12 Apr 2026)');
  });

  it('formatApaCitationsInMarkdown converts markdown links to APA with date', () => {
    const out = formatApaCitationsInMarkdown(
      'Residents report relief [Ynet](https://www.ynet.co.il/article).',
      '2026-04-12',
    );
    assert.equal(out, 'Residents report relief (Ynet, 12 Apr 2026).');
  });

  it('formatApaCitationsInMarkdown linked mode keeps author hyperlink', () => {
    const out = formatApaCitationsInMarkdown(
      'Residents report relief [Ynet](https://www.ynet.co.il/article).',
      '2026-04-12',
      { linked: true },
    );
    assert.match(out, /\(\[Ynet\]\(https:\/\/www\.ynet\.co\.il\/article\), 12 Apr 2026\)/);
  });

  it('apaAuthorLabel derives hostname from generic source', () => {
    assert.equal(
      apaAuthorLabel('source', 'https://www.ynet.co.il/story'),
      'ynet.co.il',
    );
  });
});
