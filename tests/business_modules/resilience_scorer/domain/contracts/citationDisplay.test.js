import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  sourceTypeCitationLabel,
  citationDateLabelForSignal,
  citationAuthorForSignal,
  buildCitationRegistryFromStored,
  proseHasResolvableCitations,
  apaSourceFromSignalEntry,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/citationDisplay.js';
import { formatApaCitationDate } from '../../../../../business_modules/resilience_scorer/domain/contracts/apaCitationFormat.js';

describe('citationDisplay', () => {
  it('sourceTypeCitationLabel maps field types to Field visit', () => {
    assert.equal(sourceTypeCitationLabel('field'), 'Field visit');
    assert.equal(sourceTypeCitationLabel('field_report'), 'Field visit');
    assert.equal(sourceTypeCitationLabel('radio'), 'Radio');
  });

  it('citationAuthorForSignal uses domain for URLs', () => {
    assert.equal(
      citationAuthorForSignal({
        article_url: 'https://www.ynet.co.il/news/article',
        article_source: 'Ynet',
      }),
      'ynet.co.il',
    );
  });

  it('citationAuthorForSignal always uses Field visit for field source without URL', () => {
    assert.equal(
      citationAuthorForSignal({
        source_type: 'visits',
        article_source: 'Hebrew visitor name',
      }),
      'Field visit',
    );
  });

  it('citationAuthorForSignal returns empty when no URL or label', () => {
    assert.equal(citationAuthorForSignal({ evidence: 'orphan' }), '');
  });

  it('buildCitationRegistryFromStored builds byRef index', () => {
    const registry = buildCitationRegistryFromStored([
      {
        label: 'S1',
        ref: 'fear_expression@idx:3',
        source_type: 'visits',
        article_url: null,
      },
    ]);
    assert.ok(registry?.byRef.has('fear_expression@idx:3'));
    assert.ok(registry?.byLabel.has('S1'));
  });

  it('proseHasResolvableCitations detects internal ref brackets', () => {
    assert.equal(
      proseHasResolvableCitations('Text [resilience_narrative_positive@idx:7].'),
      true,
    );
    assert.equal(proseHasResolvableCitations('Plain prose.'), false);
  });
});

describe('per-source-type inline citation shape', () => {
  const pbo = { source_type: 'pbo', article_source: 'pbo-אעבלין' };
  const press = { source_type: 'news', article_url: 'https://www.ynet.co.il/article' };
  const visit = { source_type: 'visits', article_source: 'נאיל + אראיל' };

  it('names the municipality on a PBO citation', () => {
    assert.equal(citationAuthorForSignal(pbo), 'PBO report, אעבלין');
  });

  it('prefers an explicit municipality field over the pbo-<name> unit id', () => {
    assert.equal(
      citationAuthorForSignal({ source_type: 'pbo', article_source: 'pbo-x', municipality: 'ראמה' }),
      'PBO report, ראמה',
    );
  });

  it('falls back to the bare label when no municipality can be derived', () => {
    assert.equal(citationAuthorForSignal({ source_type: 'pbo', article_source: 'unknown' }), 'PBO report');
  });

  it('keeps the site name as the press author', () => {
    assert.equal(citationAuthorForSignal(press), 'ynet.co.il');
  });

  it('dates PBO returns dd-mm and press dd:mm:yyyy', () => {
    assert.equal(citationDateLabelForSignal(pbo, '2026-04-02', formatApaCitationDate), '02-04');
    assert.equal(citationDateLabelForSignal(press, '2026-04-02', formatApaCitationDate), '02:04:2026');
  });

  it('leaves every other source type on the APA label', () => {
    assert.equal(citationDateLabelForSignal(visit, '2026-04-02', formatApaCitationDate), '02 Apr 2026');
    assert.equal(citationDateLabelForSignal({ source_type: 'radio' }, '2026-04-02', formatApaCitationDate), '02 Apr 2026');
  });

  it('returns empty for an unparseable date', () => {
    assert.equal(citationDateLabelForSignal(pbo, 'bad', formatApaCitationDate), '');
    assert.equal(citationDateLabelForSignal(pbo, null, formatApaCitationDate), '');
  });

  it('carries source_type through apaSourceFromSignalEntry so the resolver can pick a shape', () => {
    assert.equal(apaSourceFromSignalEntry({ signal: pbo }).sourceType, 'pbo');
  });
});
