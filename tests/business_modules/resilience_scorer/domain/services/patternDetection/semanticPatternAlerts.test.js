import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectSemanticPatterns } from '../../../../../../business_modules/resilience_scorer/domain/services/patternDetection/semanticPatternAlerts.js';
import { buildUserRecommendations } from '../../../../../../business_modules/resilience_scorer/domain/services/patternDetection/userRecommendations.js';

describe('semanticPatternAlerts', () => {
  it('detects information vacuum with rumor spread', () => {
    const signals = [
      { signal_type: 'rumor_spread', article_url: 'a1', source_type: 'whatsapp', evidence: 'rumor 1' },
      { signal_type: 'rumor_spread', article_url: 'a2', source_type: 'social', evidence: 'rumor 2' },
      { signal_type: 'information_confusion', article_url: 'a3', source_type: 'radio', evidence: 'confused' },
    ];
    const patterns = detectSemanticPatterns(signals);
    assert.ok(patterns.some((p) => p.pattern_code === 'information_vacuum_rumor'));
  });

  it('detects official vs local conflict', () => {
    const signals = [
      { signal_type: 'information_clarity', article_url: 'o1', source_type: 'radio', evidence: 'path clear' },
      { signal_type: 'rumor_spread', article_url: 'l1', source_type: 'whatsapp', evidence: 'blocked roads' },
    ];
    const patterns = detectSemanticPatterns(signals);
    assert.ok(patterns.some((p) => p.pattern_code === 'official_local_conflict'));
  });

  it('builds pending user recommendations', () => {
    const patterns = detectSemanticPatterns([
      { signal_type: 'rumor_spread', article_url: 'a1', source_type: 'whatsapp' },
      { signal_type: 'rumor_spread', article_url: 'a2', source_type: 'social' },
      { signal_type: 'information_confusion', article_url: 'a3', source_type: 'news' },
    ]);
    const recs = buildUserRecommendations(patterns);
    assert.equal(recs.length, patterns.length);
    assert.equal(recs[0].status, 'pending');
    assert.ok(recs[0].id.startsWith('rec:'));
  });
});
