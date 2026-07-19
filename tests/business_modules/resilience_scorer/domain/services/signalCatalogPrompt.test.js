import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  formatSignalCatalog,
  formatSignalCatalogSubset,
  formatDisambiguationBlock,
  getMirrorTypeForSelfCheck,
  DISAMBIGUATION_PRIORITY_TYPES,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/routing/signalCatalogPrompt.js';
import { SIGNAL_CATALOG, getSignalCatalogEntry } from '../../../../../business_modules/resilience_scorer/domain/services/signals/routing/signalRouter.js';

describe('signalCatalogPrompt', () => {
  it('formatSignalCatalog includes v6 types', () => {
    const out = formatSignalCatalog();
    assert.match(out, /self_evacuation_unauthorized/);
    assert.match(out, /early_warning_system_failure/);
    assert.match(out, /population_survey_finding/);
    assert.match(out, /connectivity_outage/);
  });

  it('formatDisambiguationBlock emits catalog metadata for priority types', () => {
    const out = formatDisambiguationBlock({ maxEntries: 5 });
    assert.match(out, /solidarity_help_others/);
    assert.match(out, /ACCEPT:|NOT:|Mirror/);
  });

  it('priority types with disambiguation exist in catalog', () => {
    for (const t of DISAMBIGUATION_PRIORITY_TYPES) {
      const entry = getSignalCatalogEntry(t);
      assert.ok(entry, `missing priority type ${t}`);
    }
  });

  it('mirror pairs resolve for self-check', () => {
    assert.equal(getMirrorTypeForSelfCheck('solidarity_help_others'), 'social_isolation');
    assert.equal(getMirrorTypeForSelfCheck('early_warning_system_failure'), 'early_warning_system_effective');
  });

  it('formatSignalCatalogSubset filters domains', () => {
    const out = formatSignalCatalogSubset(['preparedness']);
    assert.match(out, /early_warning_system_effective/);
    assert.doesNotMatch(out, /solidarity_help_others/);
  });

  it('top misclassification types have disambiguation or examples', () => {
    const mustHave = ['harm_to_population', 'service_disruption', 'resilience_narrative_negative'];
    for (const t of mustHave) {
      const e = SIGNAL_CATALOG.find((x) => x.type === t);
      assert.ok(e?.disambiguation || e?.example_evidence?.length, `${t} lacks disambiguation metadata`);
    }
  });
});
