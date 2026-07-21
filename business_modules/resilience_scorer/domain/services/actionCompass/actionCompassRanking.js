/**
 * Action compass — value ranking and kind-diversity selection.
 *
 * Pipeline position: STAGE-2 assess finalize — ranks merged compass candidates
 * and selects top-N with kind diversity (replaces source-insertion-order ranking).
 *
 * Owns: action value scoring and greedy kind-diversity slot selection.
 * Does NOT: collect candidates or phrase actions (see sibling modules).
 *
 * Key collaborators: `actionCompass/actionCompass.js`, `actionCompass/actionCompassKinds.js`.
 */

// ---------------------------------------------------------------------------
// Scoring weights
// ---------------------------------------------------------------------------

const LEVEL_SCORE = { critical: 100, warning: 60, watch: 30, info: 10 };

/** Verb-bearing sources rank above raw diagnostics. */
const SOURCE_ACTIONABILITY = {
  brief: 25,
  recommendation: 22,
  gap: 20,
  void: 15,
  attention: 0,
};

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Compute a value score for a merged compass action (higher = more actionable).
 * @param {object} action merged action with `{ level, source, component_id, ground, code, novelty }`
 * @returns {number}
 */
export function scoreAction(action) {
  if (!action || typeof action !== 'object') return 0;

  let score = LEVEL_SCORE[action.level] ?? 10;

  score += SOURCE_ACTIONABILITY[action.source] ?? 0;

  // specificity — named place / cluster / component is more actionable
  const hasGeo = (action.ground?.cluster_count ?? 0) > 0
    || (action.ground?.geo_unknown_count ?? 0) > 0;
  if (action.component_id) score += 15;
  if (hasGeo) score += 12;

  // novelty — new today beats persisted; persisted situations lose urgency
  if (action.novelty === 'persisted') score -= 12;
  else if (action.novelty === 'new') score += 8;

  // info penalty — context-only items should never crowd out real actions
  if (action.level === 'info') score -= 20;

  // merged evidence breadth is a mild signal of importance
  const evidence = Array.isArray(action.evidence_codes) ? action.evidence_codes.length : 0;
  if (evidence > 1) score += Math.min(evidence - 1, 3) * 2;

  return score;
}

// ---------------------------------------------------------------------------
// Kind-diversity selection
// ---------------------------------------------------------------------------

/**
 * Greedily select up to `limit` actions, preferring kind diversity (at most
 * `maxPerKind` of any one kind) on the first pass, then filling remaining slots
 * from highest-scored leftovers.
 *
 * @param {Array<object>} actions already scored (have `_score` and `kind`)
 * @param {number} limit
 * @param {{ maxPerKind?: number }} [opts]
 * @returns {Array<object>}
 */
export function selectWithKindDiversity(actions, limit, opts = {}) {
  const maxPerKind = opts.maxPerKind ?? 2;
  const sorted = [...(actions ?? [])].sort((a, b) => {
    const sa = a._score ?? 0;
    const sb = b._score ?? 0;
    if (sb !== sa) return sb - sa;
    return (a._order ?? 0) - (b._order ?? 0);
  });

  const selected = [];
  const kindCount = new Map();
  const leftovers = [];

  for (const action of sorted) {
    if (selected.length >= limit) break;
    const used = kindCount.get(action.kind) ?? 0;
    if (used < maxPerKind) {
      selected.push(action);
      kindCount.set(action.kind, used + 1);
    } else {
      leftovers.push(action);
    }
  }

  // Backfill remaining slots, but keep preferring kind diversity: fill from
  // leftover kinds not yet selected before topping up with already-used kinds.
  // Otherwise a monothematic candidate pool (e.g. all source-mix "investigate"
  // gaps) packs the panel with near-identical items.
  const fillBy = (predicate) => {
    for (const action of leftovers) {
      if (selected.length >= limit) break;
      if (selected.includes(action)) continue;
      if (!predicate(action)) continue;
      selected.push(action);
      kindCount.set(action.kind, (kindCount.get(action.kind) ?? 0) + 1);
    }
  };

  fillBy((action) => !kindCount.has(action.kind));
  fillBy(() => true);

  return selected;
}
