/**
 * Deterministic semantic pattern detection on scoped signals (no LLM).
 *
 * Pipeline position: STAGE-2 assess — scans loaded signals for cross-source
 * information/rumor patterns before operator recommendations are built.
 *
 * Owns: rule-based pattern detection (vacuum+rumor, official/local conflict,
 * active rumor clusters) and evidence ref shaping.
 * Does NOT: invoke LLMs, rank actions (see `actionCompass/`), or mutate signals.
 *
 * Key collaborators: `patternDetection/operatorRecommendations.js`,
 * `services/operator/attentionItems.js`, assess finalize.
 */

// ---------------------------------------------------------------------------
// Source and signal-type sets
// ---------------------------------------------------------------------------

const OFFICIAL_SOURCE_TYPES = new Set(['radio', 'news', 'pbo', 'pbo_regional', 'naftali']);
const LOCAL_SOURCE_TYPES = new Set(['whatsapp', 'social', 'field', 'visits', 'field_whatsapp']);

const CLARITY_TYPES = new Set([
  'information_clarity',
  'information_actionable_effective',
  'leadership_clear_guidance',
  'early_warning_system_effective',
  'trusted_information_source',
]);

const CONFUSION_TYPES = new Set([
  'information_confusion',
  'rumor_spread',
  'meta_information_gap',
  'information_vacuum_post_event',
  'mistrusted_information_source',
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * @param {object} signal
 */
function signalRef(signal) {
  return {
    signal_type: signal.signal_type ?? signal.type ?? null,
    article_url: signal.article_url ?? null,
    evidence: signal.evidence ? String(signal.evidence).slice(0, 240) : null,
    source_type: signal.source_type ?? null,
  };
}

/**
 * @param {Array<object>} signals
 */
function distinctArticles(signals) {
  const keys = new Set();
  for (const s of signals) {
    const k = s.article_url ?? s.article_index ?? s.evidence;
    if (k != null) keys.add(String(k));
  }
  return keys.size;
}

/**
 * @param {Array<object>} signals
 * @param {Set<string>} types
 */
function filterByTypes(signals, types) {
  return (signals ?? []).filter((s) => types.has(s.signal_type ?? s.type ?? ''));
}

/**
 * @param {Array<object>} signals
 * @param {Set<string>} sourceTypes
 */
function filterBySourceTypes(signals, sourceTypes) {
  return (signals ?? []).filter((s) => sourceTypes.has(s.source_type ?? ''));
}

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

/**
 * Detect semantic cross-source patterns in a scoped signal list.
 * @param {Array<object>} signals
 * @returns {Array<object>}
 */
export function detectSemanticPatterns(signals) {
  if (!Array.isArray(signals) || signals.length === 0) return [];

  const patterns = [];
  const rumorSpread = filterByTypes(signals, new Set(['rumor_spread']));
  const infoConfusion = filterByTypes(signals, new Set(['information_confusion']));
  const rumorCorrection = filterByTypes(signals, new Set(['rumor_correction']));

  if (rumorSpread.length >= 2 && infoConfusion.length >= 1) {
    const refs = [...rumorSpread.slice(0, 2), ...infoConfusion.slice(0, 1)].map(signalRef);
    patterns.push({
      id: 'pattern:information_vacuum_rumor',
      pattern_code: 'information_vacuum_rumor',
      level: 'warning',
      component_id: 'information_communication',
      title_key: 'attention.pattern.informationVacuumRumor',
      detail_key: 'attention.pattern.informationVacuumRumorDetail',
      detail_params: {
        rumor_count: rumorSpread.length,
        confusion_count: infoConfusion.length,
        distinct_articles: distinctArticles([...rumorSpread, ...infoConfusion]),
      },
      evidence_refs: refs,
      suggested_action_key: 'attention.suggested.commsClarification',
      recommended_action: {
        type: 'comms_clarification',
        channels: ['civil_defense', 'local_whatsapp', 'municipal'],
      },
    });
  }

  const officialClarity = filterBySourceTypes(
    filterByTypes(signals, CLARITY_TYPES),
    OFFICIAL_SOURCE_TYPES,
  );
  const localConfusion = filterBySourceTypes(
    filterByTypes(signals, CONFUSION_TYPES),
    LOCAL_SOURCE_TYPES,
  );

  if (officialClarity.length >= 1 && localConfusion.length >= 1) {
    const refs = [...officialClarity.slice(0, 2), ...localConfusion.slice(0, 2)].map(signalRef);
    patterns.push({
      id: 'pattern:official_local_conflict',
      pattern_code: 'official_local_conflict',
      level: 'critical',
      component_id: 'information_communication',
      title_key: 'attention.pattern.officialLocalConflict',
      detail_key: 'attention.pattern.officialLocalConflictDetail',
      detail_params: {
        official_count: officialClarity.length,
        local_count: localConfusion.length,
      },
      evidence_refs: refs,
      suggested_action_key: 'attention.suggested.commsClarification',
      recommended_action: {
        type: 'comms_clarification',
        channels: ['civil_defense', 'local_whatsapp'],
      },
    });
  }

  if (rumorSpread.length >= 3 && rumorCorrection.length === 0) {
    const sourceTypes = new Set(rumorSpread.map((s) => s.source_type).filter(Boolean));
    if (sourceTypes.size >= 2) {
      patterns.push({
        id: 'pattern:active_rumor_cluster',
        pattern_code: 'active_rumor_cluster',
        level: 'watch',
        component_id: 'information_communication',
        title_key: 'attention.pattern.activeRumorCluster',
        detail_key: 'attention.pattern.activeRumorClusterDetail',
        detail_params: {
          rumor_count: rumorSpread.length,
          source_types: sourceTypes.size,
        },
        evidence_refs: rumorSpread.slice(0, 4).map(signalRef),
        suggested_action_key: 'attention.suggested.monitorRumors',
        recommended_action: {
          type: 'monitor_rumors',
          channels: ['local_whatsapp', 'social'],
        },
      });
    }
  }

  return patterns;
}
