import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapFindingToSignal, mapFindingsToSignals } from '../../../../../business_modules/social_media/domain/services/findingToSignalMapper.js';

describe('findingToSignalMapper', () => {
  const sampleFinding = {
    id: 'f01',
    date: '2026-04-16',
    location: 'נהריה',
    platform: 'hebrew_forum_hasolidit',
    url: 'https://www.hasolidit.com/example',
    quote_original: 'עבורי בנהריה, ממ"ד חשוב מאוד בגלל זמן ההתרעה.',
    speaker_role: 'תושב',
    behavior_or_emotion: 'הצדקה אישית של ההשקעה בממ"ד',
    resilience_component: 'lifesaving_behavior',
    confidence: 'גבוהה',
  };

  it('maps finding to resilience signal', () => {
    const signal = mapFindingToSignal(sampleFinding);
    assert.ok(signal);
    assert.equal(signal.signal_type, 'compliance_enter_shelter');
    assert.equal(signal.evidence_type, 'direct_quote_named_person');
    assert.equal(signal.scope_level, 'repeated_pattern');
    assert.equal(signal.source_type, 'social');
    assert.match(signal.evidence, /ממ"ד/);
  });

  it('maps array of findings', () => {
    const signals = mapFindingsToSignals([sampleFinding, { quote_original: '' }]);
    assert.equal(signals.length, 1);
  });
});
