/**
 * Signal-catalog introspection for chat: what a signal type means and how it
 * routes into components. Deterministic — reads only the canonical catalog.
 */
import {
  SIGNAL_TYPES,
  getSignalCatalogEntry,
  canonicalizeSignalType,
  SIGNAL_TO_COMPONENTS,
  NON_SCORING_FALLBACK_TYPES,
} from '../../resilience_scorer/index.js';

const MAX_SUGGESTIONS = 8;

function suggestSignalTypes(raw) {
  const q = String(raw ?? '').toLowerCase();
  const queryTokens = q.split(/[^a-z]+/).filter((t) => t.length >= 4);
  if (queryTokens.length === 0) return [];
  const tokensOverlap = (typeToken) =>
    queryTokens.some((qt) => qt.includes(typeToken) || typeToken.includes(qt));
  return SIGNAL_TYPES
    .filter((t) => t.includes(q) || t.split('_').filter((tt) => tt.length >= 4).some(tokensOverlap))
    .slice(0, MAX_SUGGESTIONS);
}

function formatRoutingLines(canonical) {
  if (NON_SCORING_FALLBACK_TYPES.has(canonical)) {
    return ['routing: (non-scoring fallback type — routed to no component)'];
  }
  const edges = SIGNAL_TO_COMPONENTS[canonical];
  if (!edges || Object.keys(edges).length === 0) {
    return ['routing: (no routing edges)'];
  }
  return [
    'routing:',
    ...Object.entries(edges).map(
      ([cid, e]) => `- ${cid}: role=${e.role} polarity=${e.polarity}`,
    ),
  ];
}

/**
 * @param {string} rawType signal type id or alias (free text)
 * @returns {string} formatted catalog card, or a miss message with suggestions
 */
export function describeSignalType(rawType) {
  const raw = String(rawType ?? '').trim();
  const canonical = canonicalizeSignalType(raw);
  const entry = getSignalCatalogEntry(canonical);
  if (!entry) {
    const suggestions = suggestSignalTypes(raw);
    return suggestions.length > 0
      ? `Unknown signal type "${raw}". Close matches: ${suggestions.join(', ')}`
      : `Unknown signal type "${raw}" and no close matches. Use the lookup_signals signal_type enum or signal_stats group_by=signal_type to see what exists.`;
  }

  const aliasNote = canonical !== raw && raw ? ` (canonicalized from "${raw}")` : '';
  const lines = [
    `type: ${entry.type}${aliasNote}`,
    `label: ${entry.label}`,
    `domain: ${entry.domain}`,
    `signal_class: ${entry.signal_class}`,
    `construct_role: ${entry.construct_role}`,
    `default_polarity: ${entry.defaultPolarity}`,
  ];
  if (entry.mirror) lines.push(`mirror: ${entry.mirror}`);
  if (entry.related?.length) lines.push(`related: ${entry.related.join(', ')}`);
  lines.push(...formatRoutingLines(entry.type));
  if (entry.disambiguation?.not_confused_with?.length) {
    lines.push(`not_confused_with: ${entry.disambiguation.not_confused_with.join(', ')}`);
  }
  if (entry.example_evidence?.length) {
    lines.push('example_evidence:', ...entry.example_evidence.map((e) => `- ${e}`));
  }
  return lines.join('\n');
}
