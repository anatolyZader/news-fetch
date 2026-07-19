import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateOsintChannelQuarantine,
  applyOsintQuarantineFilter,
  isOsintQuarantineAutoEnabled,
  QUARANTINE_REASON_OSINT,
} from '../../../../../business_modules/resilience_scorer/domain/services/dataVoid/socialChannelQuarantine.js';

function osintSignal(sourceType, polarity, type = 'fear_expression') {
  return {
    source_type: sourceType,
    signal_type: type,
    polarity,
    extraction_confidence: 0.9,
  };
}

describe('osintChannelQuarantine', () => {
  it('suggests on polarized telegram + social mix', () => {
    const signals = [
      ...Array.from({ length: 4 }, () => osintSignal('telegram', '-')),
      ...Array.from({ length: 4 }, () => osintSignal('social', '+')),
      ...Array.from({ length: 2 }, () => ({ source_type: 'news', signal_type: 'service_continuity' })),
    ];
    const r = evaluateOsintChannelQuarantine(signals);
    assert.equal(r.suggested, true);
    assert.equal(r.osint_signal_count, 8);
    assert.equal(r.telegram_signal_count, 4);
  });

  it('auto-excludes when enabled and not dismissed', () => {
    const prev = process.env.RESILIENCE_OSINT_QUARANTINE_AUTO;
    process.env.RESILIENCE_OSINT_QUARANTINE_AUTO = '1';
    try {
      const signals = [
        ...Array.from({ length: 5 }, () => osintSignal('social', '-')),
        ...Array.from({ length: 5 }, () => osintSignal('telegram', '+')),
        { source_type: 'news', signal_type: 'service_continuity' },
      ];
      const r = evaluateOsintChannelQuarantine(signals, { dismissed: false });
      assert.equal(r.auto_excluded, true);
      assert.equal(r.active, true);
      assert.equal(r.reason, QUARANTINE_REASON_OSINT);
      const filtered = applyOsintQuarantineFilter(signals, r);
      assert.ok(filtered.every((s) => s.source_type === 'news'));
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_OSINT_QUARANTINE_AUTO;
      else process.env.RESILIENCE_OSINT_QUARANTINE_AUTO = prev;
    }
  });

  it('does not auto-exclude when dismissed', () => {
    process.env.RESILIENCE_OSINT_QUARANTINE_AUTO = '1';
    const signals = [
      ...Array.from({ length: 5 }, () => osintSignal('social', '-')),
      ...Array.from({ length: 5 }, () => osintSignal('telegram', '+')),
    ];
    const r = evaluateOsintChannelQuarantine(signals, { dismissed: true });
    assert.equal(r.suggested, true);
    assert.equal(r.auto_excluded, false);
    assert.equal(r.active, false);
  });

  it('auto quarantine defaults on', () => {
    const prev = process.env.RESILIENCE_OSINT_QUARANTINE_AUTO;
    delete process.env.RESILIENCE_OSINT_QUARANTINE_AUTO;
    try {
      assert.equal(isOsintQuarantineAutoEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_OSINT_QUARANTINE_AUTO;
      else process.env.RESILIENCE_OSINT_QUARANTINE_AUTO = prev;
    }
  });
});
