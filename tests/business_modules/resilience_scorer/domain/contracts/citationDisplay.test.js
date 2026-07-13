import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  sourceTypeCitationLabel,
  citationAuthorForSignal,
  buildCitationRegistryFromStored,
  proseHasResolvableCitations,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/citationDisplay.js';

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
        source_type: 'field',
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
        source_type: 'field',
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
