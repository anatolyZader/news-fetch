import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeRefForAnchor,
  evidenceAnchorHref,
  evidenceAnchorId,
  isEvidenceAnchorHref,
} from '../../../cross-cut-modules/resilience-contracts/evidenceAnchor.js';

describe('evidenceAnchor', () => {
  it('encodeRefForAnchor slugifies signal refs', () => {
    assert.equal(
      encodeRefForAnchor('resilience_narrative_positive@idx:7'),
      'resilience_narrative_positive-idx-7',
    );
    assert.equal(
      encodeRefForAnchor('fear_expression@url:https://www.ynet.co.il/a'),
      'fear_expression-url-https-www-ynet-co-il-a',
    );
  });

  it('evidenceAnchorId combines component and ref', () => {
    assert.equal(
      evidenceAnchorId('narrative', 'fear_expression@idx:3'),
      'evidence-narrative-fear_expression-idx-3',
    );
  });

  it('evidenceAnchorHref returns hash link', () => {
    assert.equal(
      evidenceAnchorHref('functional_continuity', 'type_a@idx:1'),
      '#evidence-functional_continuity-type_a-idx-1',
    );
  });

  it('isEvidenceAnchorHref detects in-page evidence links', () => {
    assert.equal(isEvidenceAnchorHref('#evidence-narrative-x'), true);
    assert.equal(isEvidenceAnchorHref('https://ynet.co.il'), false);
  });
});
