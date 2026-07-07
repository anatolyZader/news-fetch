/** Shared formatters for reportWriter section builders (Sonar-friendly helpers). */

export function dashIfNull(value, format) {
  if (value == null) return '—';
  return format(value);
}

export function formatNorrisHeaderMetrics(cap, includeScores) {
  const certStr = dashIfNull(cap.certainty, (v) => `${Math.round(v * 100)}%`);
  const massStr = dashIfNull(cap.evidence_mass, (v) => `${Math.round(v * 10) / 10}`);
  if (includeScores) {
    const scoreStr = dashIfNull(cap.score, (v) => `${v.toFixed(1)}/10`);
    return `**Score:** ${scoreStr}  |  **Evidence level:** ${certStr}  |  **Evidence mass:** ${massStr}`;
  }
  return `**Evidence level:** ${certStr}  |  **Evidence mass:** ${massStr} *(numeric Norris scores omitted in brief)*`;
}

export function formatComponentScoreLine(comp) {
  if (comp.score == null) return '';
  if (comp.score_low != null && comp.score_high != null) {
    return `**Score:** ${comp.score}/10  *(90% CI: ${comp.score_low}–${comp.score_high})*`;
  }
  return `**Score:** ${comp.score}/10`;
}

export function formatFacetLine(name, facet, includeScores) {
  if (includeScores) {
    const scoreStr = dashIfNull(facet.score, (v) => `${v}/10`);
    return `- *${name}:* ${scoreStr} (${facet.signal_count ?? 0} signals)`;
  }
  return `- *${name}:* ${facet.signal_count ?? 0} signals`;
}

export function formatContributorLine(t) {
  const url = t.article_url ? ` ([source](${t.article_url}))` : '';
  const c = dashIfNull(t._contribution_raw, (v) => v.toFixed(2));
  const comp = t.component_id ? ` (${t.component_id})` : '';
  return `- \`${t.signal_type ?? 'unknown'}\`${comp}: "${t.evidence ?? ''}" — contribution ${c}${url}`;
}
