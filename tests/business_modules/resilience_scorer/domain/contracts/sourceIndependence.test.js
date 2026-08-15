import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SOURCE_CLASS,
  UNCLASSIFIED_SOURCE_CLASS,
  isIndependentClass,
  isSelfAssessing,
  sourceClassOf,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/sourceIndependence.js';
import {
  FIELD_FAMILY_SOURCE_TYPES,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/sourceFamilies.js';

describe('sourceClassOf', () => {
  it('classifies every source type the pipeline config enables', () => {
    const config = JSON.parse(readFileSync('pipeline-config.json', 'utf8'));
    const configured = Object.keys(config.sources ?? {});
    assert.ok(configured.length > 0, 'pipeline-config should list sources');
    const unmapped = configured.filter((t) => sourceClassOf(t) === UNCLASSIFIED_SOURCE_CLASS);
    assert.deepEqual(unmapped, [], `unclassified source types: ${unmapped.join(', ')}`);
  });

  it('classifies every field-family source type', () => {
    const unmapped = FIELD_FAMILY_SOURCE_TYPES.filter((t) => sourceClassOf(t) === UNCLASSIFIED_SOURCE_CLASS);
    assert.deepEqual(unmapped, []);
  });

  it('returns the unclassified bucket for an unknown type rather than guessing', () => {
    assert.equal(sourceClassOf('carrier_pigeon'), UNCLASSIFIED_SOURCE_CLASS);
    assert.equal(sourceClassOf(undefined), UNCLASSIFIED_SOURCE_CLASS);
  });

  it('never counts an unclassified type as independent', () => {
    assert.equal(isIndependentClass(UNCLASSIFIED_SOURCE_CLASS), false);
  });

  it('separates the PBO self-report from the field observer', () => {
    assert.equal(sourceClassOf('pbo'), SOURCE_CLASS.self_reported);
    assert.equal(sourceClassOf('visits'), SOURCE_CLASS.expert_observer);
    assert.equal(isIndependentClass(SOURCE_CLASS.expert_observer), false);
    assert.equal(isIndependentClass(SOURCE_CLASS.independent_media), true);
  });
});

describe('isSelfAssessing', () => {
  it('holds where the PBO author is the assessed object', () => {
    assert.equal(isSelfAssessing('leadership', SOURCE_CLASS.self_reported), true);
    assert.equal(isSelfAssessing('information_communication', SOURCE_CLASS.self_reported), true);
  });

  it('does not hold where the PBO describes a third party', () => {
    assert.equal(isSelfAssessing('wellbeing_at_risk', SOURCE_CLASS.self_reported), false);
    assert.equal(isSelfAssessing('belonging_solidarity', SOURCE_CLASS.self_reported), false);
  });

  it('does not hold for an outside observer on a self-assessed component', () => {
    assert.equal(isSelfAssessing('leadership', SOURCE_CLASS.expert_observer), false);
  });
});
