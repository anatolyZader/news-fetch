import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  operatorSurfaceMode,
  operatorMaxClaims,
  shouldUseRichDeterministicPath,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/operatorSurfaceMode.js';
import {
  groupPoolItemsBySource,
  poolItemSourceBucket,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/evidencePoolGrouping.js';
import {
  assignOperatorEpistemicRole,
  attachRichOperatorSurface,
  attachRichInvestigationPool,
  buildDeterministicNarrativeFromClaims,
  buildComponentInvestigationPool,
  buildHighlightedEvidenceFromPool,
} from '../../../../../business_modules/resilience_scorer/domain/services/operator/operatorInvestigationSurface.js';
import {
  comparePoolItems,
  inferredPoolRenderMode,
  routingLabelSuffix,
} from '../../../../../business_modules/resilience_scorer/domain/services/operator/evidenceFormatting.js';
import { SIGNAL_PROVENANCE } from '../../../../../business_modules/resilience_scorer/domain/services/signals/evidenceEligibility.js';
import {
  finalizeOperatorNarrativeSurface,
  isStubNarrative,
} from '../../../../../business_modules/resilience_scorer/domain/services/operator/operatorNarrativeSurface.js';

describe('operatorSurfaceMode', () => {
  it('defaults to legacy', () => {
    const env = { RESILIENCE_OPERATOR_SURFACE_MODE: undefined };
    assert.equal(operatorSurfaceMode(env), 'legacy');
    assert.equal(shouldUseRichDeterministicPath(env), false);
  });

  it('rich when env set', () => {
    const env = { RESILIENCE_OPERATOR_SURFACE_MODE: 'rich' };
    assert.equal(operatorSurfaceMode(env), 'rich');
    assert.equal(shouldUseRichDeterministicPath(env), true);
  });

  it('operatorMaxClaims defaults to 12', () => {
    assert.equal(operatorMaxClaims({}), 12);
    assert.equal(operatorMaxClaims({ RESILIENCE_OPERATOR_MAX_CLAIMS: '8' }), 8);
  });
});

describe('evidencePoolGrouping', () => {
  it('groups pool items by source bucket', () => {
    const groups = groupPoolItemsBySource([
      { source_type: 'visits', evidence: 'a' },
      { source_type: 'pbo', evidence: 'b' },
      { source_type: 'news', evidence: 'c' },
    ]);
    assert.equal(groups.length, 3);
    assert.equal(groups[0].key, 'visits');
    assert.equal(poolItemSourceBucket({ source_type: 'news' }), 'press');
  });
});

describe('operatorInvestigationSurface', () => {
  const fearSignal = {
    signal_type: 'fear_expression',
    source_type: 'visits',
    article_url: 'https://example.com/fear',
    evidence: 'Residents report elevated anxiety in shelter.',
    metricsEligible: true,
  };
  const narrativeSignal = {
    signal_type: 'resilience_narrative_positive',
    source_type: 'visits',
    article_url: 'https://example.com/narrative',
    evidence: 'Residents describe the community as coping effectively.',
    metricsEligible: true,
  };
  const macroSignal = {
    signal_type: 'harm_to_population',
    source_type: 'news',
    article_url: 'https://example.com/macro',
    evidence: 'מד״א מפנה חמישה נפגעים מבני ברק לאחר ירי טילים.',
    signalProvenance: SIGNAL_PROVENANCE.narrative_national_context,
    metricsEligible: false,
  };

  it('assignOperatorEpistemicRole labels context and scored', () => {
    const scoringSet = new Set([fearSignal]);
    const quarantineSet = new Set();
    assert.equal(assignOperatorEpistemicRole(fearSignal, scoringSet, quarantineSet), 'scored');
    assert.equal(assignOperatorEpistemicRole(macroSignal, scoringSet, quarantineSet), 'context_only');
  });

  it('buildComponentInvestigationPool keeps only strong catalog links per component', () => {
    const pool = buildComponentInvestigationPool('narrative', [narrativeSignal, macroSignal, fearSignal], {
      scoringSet: new Set([narrativeSignal]),
      quarantineSet: new Set(),
      maxChars: 500,
    });
    assert.equal(pool.length, 1);
    assert.equal(pool[0].signal_type, 'resilience_narrative_positive');
    assert.equal(pool[0].operator_epistemic_role, 'scored');
  });

  it('buildComponentInvestigationPool routes harm_to_population to wellbeing not narrative', () => {
    const harm = {
      signal_type: 'harm_to_population',
      source_type: 'news',
      evidence: 'בקריית שמונה מספר בני אדם נפצעו באורח קל.',
      metricsEligible: true,
    };
    const narrativePool = buildComponentInvestigationPool('narrative', [harm], {
      scoringSet: new Set([harm]),
      quarantineSet: new Set(),
      maxChars: 500,
    });
    const wellbeingPool = buildComponentInvestigationPool('wellbeing_at_risk', [harm], {
      scoringSet: new Set([harm]),
      quarantineSet: new Set(),
      maxChars: 500,
    });
    assert.equal(narrativePool.length, 0);
    assert.equal(wellbeingPool.length, 1);
  });

  it('buildComponentInvestigationPool routes near_miss_reported to lifesaving not narrative', () => {
    const nearMiss = {
      signal_type: 'near_miss_reported',
      source_type: 'news',
      article_source: 'maariv.co.il',
      evidence: 'מכתש עצום נפער מאחורי תיכון בפתח תקווה, כתוצאה מנפילת טיל מאיראן - ללא נפגעים... מזל גדול שזה קרה בשטח פתוח ובימים אלו ללא לימודים אחרת האירוע פה יכול היה להסתיים באסון כבד.',
      metricsEligible: true,
    };
    const narrativePool = buildComponentInvestigationPool('narrative', [nearMiss], {
      scoringSet: new Set([nearMiss]),
      quarantineSet: new Set(),
      maxChars: 500,
    });
    const lifesavingPool = buildComponentInvestigationPool('lifesaving_behavior', [nearMiss], {
      scoringSet: new Set([nearMiss]),
      quarantineSet: new Set(),
      maxChars: 500,
    });
    assert.equal(narrativePool.length, 0);
    assert.equal(lifesavingPool.length, 1);
  });

  it('attachRichOperatorSurface populates pool without raw narrative dump', () => {
    const prev = process.env.RESILIENCE_OPERATOR_SURFACE_MODE;
    process.env.RESILIENCE_OPERATOR_SURFACE_MODE = 'rich';
    try {
      const assessment = {
        components: [{
          component_id: 'narrative',
          operator_display_state: 'insufficient_data',
          confidence: 'insufficient_data',
          instrument: { signal_count: 1, source_diversity: 1 },
        }],
      };
      attachRichOperatorSurface(assessment, {
        narrativeScopeSignals: [narrativeSignal],
        signalsForScoring: [],
        quarantinedSignals: [],
        scoringQuarantinedSignals: [narrativeSignal],
      });
      const comp = assessment.components[0];
      assert.equal(assessment.operator_surface_mode, 'rich');
      assert.equal(comp.operator_surface_starved, false);
      assert.ok(comp.operator_investigation_pool?.length >= 1);
      assert.equal(comp.narrative_operator, undefined);
      assert.equal(comp.operator_evidence_tier, 'rich_pool');
      finalizeOperatorNarrativeSurface(assessment);
      assert.ok(comp.narrative_operator?.length > 0);
      assert.ok(!comp.narrative_operator.includes('avg='));
      assert.ok(comp.operator_investigation_pool?.length >= 1);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_OPERATOR_SURFACE_MODE;
      else process.env.RESILIENCE_OPERATOR_SURFACE_MODE = prev;
    }
  });

  it('attachRichInvestigationPool preserves hybrid polished narrative_operator', () => {
    const prev = process.env.RESILIENCE_OPERATOR_SURFACE_MODE;
    process.env.RESILIENCE_OPERATOR_SURFACE_MODE = 'rich';
    try {
      const polished = (
        'Community narrative draws on multiple channels ([field](https://example.com/fear)). '
        + 'Residents report sustained coping under alert conditions.'
      );
      const comp = {
        component_id: 'narrative',
        narrative_operator: polished,
        narrative_grounding_score: 0.92,
        narrative_claims: [{
          text: 'Residents report elevated anxiety in shelter.',
          signal_refs: ['fear_expression@url:https://example.com/fear'],
        }],
      };
      const pool = buildComponentInvestigationPool('narrative', [narrativeSignal], {
        scoringSet: new Set([narrativeSignal]),
        quarantineSet: new Set(),
        maxChars: 500,
      });
      attachRichInvestigationPool(comp, pool);
      assert.equal(comp.narrative_operator, polished);
      assert.ok(comp.operator_investigation_pool?.length >= 1);
      finalizeOperatorNarrativeSurface({ components: [comp] });
      assert.equal(comp.narrative_operator, polished);
      assert.ok(!isStubNarrative(comp.narrative_operator));
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_OPERATOR_SURFACE_MODE;
      else process.env.RESILIENCE_OPERATOR_SURFACE_MODE = prev;
    }
  });

  it('buildDeterministicNarrativeFromClaims groups by role', () => {
    const prose = buildDeterministicNarrativeFromClaims([
      { text: 'Scored line', operator_epistemic_role: 'scored' },
      { text: 'Context line', operator_epistemic_role: 'context_only' },
    ]);
    assert.match(prose, /Scored line/);
    assert.match(prose, /Context line/);
    assert.match(prose, /National or regional context/);
  });
});

function poolFor(componentId, signals) {
  return buildComponentInvestigationPool(componentId, signals, {
    scoringSet: new Set(signals),
    quarantineSet: new Set(),
    maxChars: 500,
  });
}

describe('routing rationale on evidence items', () => {
  beforeEach(() => {
    // Pin the default render mode — the host env may carry overrides.
    delete process.env.RESILIENCE_POOL_INFERRED_RENDER;
  });

  const helpSignal = {
    signal_type: 'solidarity_help_others',
    source_type: 'visits',
    article_url: 'https://example.com/help',
    evidence: 'שכנים הביאו אוכל לקשישים שלא הגיעו למקלט.',
    metricsEligible: true,
  };
  const distressSignal = {
    signal_type: 'psychological_distress',
    source_type: 'news',
    article_url: 'https://example.com/distress',
    evidence: 'תושבת מדווחת על טראומה מצטברת וחוסר שינה כרוני.',
    metricsEligible: true,
  };

  it('pool items carry routing_role and exclude inferred-edge spillover', () => {
    const belonging = poolFor('belonging_solidarity', [helpSignal]);
    assert.equal(belonging.length, 1);
    assert.equal(belonging[0].routing_role, 'primary');
    assert.equal('routing_weight' in belonging[0], false);

    const capital = poolFor('community_capital', [helpSignal]);
    assert.equal(capital[0].routing_role, 'primary');

    // v10: helping behavior (construct_role 'response') no longer routes into
    // wellbeing_at_risk at all.
    assert.equal(poolFor('wellbeing_at_risk', [helpSignal]).length, 0);

    // Weak spillover edge (compliance_enter_shelter → leadership, inferred) is
    // excluded from the investigation pool entirely.
    const leadership = poolFor('leadership', [{
      signal_type: 'compliance_enter_shelter',
      source_type: 'news',
      article_url: 'https://example.com/shelter',
      evidence: 'תושבים נכנסו למקלטים מיד עם האזעקה.',
      metricsEligible: true,
    }]);
    assert.equal(leadership.length, 0);
  });

  it('highlighted markdown appends the rationale label after the source link (RTL-safe)', () => {
    const pool = poolFor('belonging_solidarity', [helpSignal]);
    const distressPool = poolFor('wellbeing_at_risk', [distressSignal]);
    const items = buildHighlightedEvidenceFromPool(pool);
    const distressItems = buildHighlightedEvidenceFromPool(distressPool);
    const help = items.find((i) => i.signal_type === 'solidarity_help_others');
    const distress = distressItems.find((i) => i.signal_type === 'psychological_distress');
    assert.ok(help.markdown.endsWith('`solidarity_help_others · primary`'));
    assert.ok(distress.markdown.includes('`psychological_distress · primary`'));
    assert.ok(help.markdown.includes('[source](https://example.com/help)'));
    assert.ok(help.markdown.indexOf('[source]') < help.markdown.indexOf('`solidarity'));
  });

  it('RESILIENCE_POOL_INFERRED_RENDER=hide is a no-op on the all-primary pool', () => {
    const pool = poolFor('community_capital', [helpSignal, {
      signal_type: 'resource_mobilization',
      source_type: 'news',
      article_url: 'https://example.com/mobilize',
      evidence: 'הרשות המקומית גייסה מתנדבים וציוד בתוך שעות.',
      metricsEligible: true,
    }]);
    process.env.RESILIENCE_POOL_INFERRED_RENDER = 'hide';
    try {
      assert.equal(inferredPoolRenderMode(), 'hide');
      const items = buildHighlightedEvidenceFromPool(pool);
      assert.equal(items.length, 2, 'primary items are never hidden');
    } finally {
      delete process.env.RESILIENCE_POOL_INFERRED_RENDER;
    }
    assert.equal(pool.length, 2);
  });

  it('alias-typed signals (stored legacy bundles) reach the pool canonicalized', () => {
    const aliasSignal = {
      signal_type: 'leadership_visible_present', // legacy alias of leadership_visible_presence
      source_type: 'pbo',
      article_url: 'https://example.com/pbo',
      evidence: 'ראש הרשות נוכח ופעיל בשטח.',
      metricsEligible: true,
    };
    const pool = poolFor('leadership', [aliasSignal]);
    assert.equal(pool.length, 1);
    assert.equal(pool[0].signal_type, 'leadership_visible_presence');
    assert.equal(pool[0].routing_role, 'primary');
  });

  it('routingLabelSuffix and comparePoolItems behave on edge cases', () => {
    assert.equal(routingLabelSuffix({}), '');
    // Fail-closed: missing routing_role renders the type without a role claim.
    assert.equal(routingLabelSuffix({ signal_type: 'x' }), ' `x`');
    assert.equal(routingLabelSuffix({ signal_type: 'x', routing_role: 'primary' }), ' `x · primary`');
    assert.equal(routingLabelSuffix({ signal_type: 'x', routing_role: 'inferred' }), ' `x · inferred`');
    assert.ok(comparePoolItems(
      { routing_role: 'primary', contribution: 0.1 },
      { routing_role: 'inferred', contribution: 9 },
    ) < 0);
    assert.ok(comparePoolItems(
      { routing_role: 'primary', contribution: 1 },
      { routing_role: 'primary', contribution: 2 },
    ) > 0);
  });
});
