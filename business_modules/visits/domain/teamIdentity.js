/**
 * Canonical identity for a field-visit team.
 *
 * Pipeline position: visits ingest — applied when the xlsx `team` column is
 * written into the markdown `**Source:**` line, which becomes `article_source`
 * on every signal extracted from that visit.
 *
 * Owns: team-name canonicalisation. Does NOT: classify source_type (see
 * `resilience_scorer/domain/services/signals/visitsSourceType.js`) or resolve
 * outlet reputation.
 */

/**
 * Separators that join co-visiting team members in the source spreadsheet.
 *
 * The Hebrew conjunction is written attached to the following name ("ואיתמר"), so
 * it only counts as a separator when whitespace precedes it — otherwise a name
 * that simply begins with vav ("ולדימיר") would lose its first letter.
 *
 * A two-word name whose second word starts with vav can still split wrongly; that
 * is inherent to the conjunction and harmless here, because a consistent mis-split
 * still yields a consistent identity — which is all this key is for.
 */
const MEMBER_SEPARATORS = /(?:\s*\+\s*|\s*,\s*|\s+ו(?=[א-ת]))/g;

/**
 * Canonicalise a field-team name so member order never forks one team into several.
 *
 * The spreadsheet is free text, so the same pair is written both ways on different
 * rows — "אנג'ל מנגוני וכארם שוקור" and "כארם שוקור ואנג'ל מנגוני" are one team.
 * Downstream, `article_source` keys per-source concentration warnings and outlet
 * reputation, so a permuted name splits one team's signals across two identities
 * and can hide a concentration that should have been flagged.
 *
 * Sorting is by Hebrew locale so the canonical form stays stable and readable.
 *
 * @param {string|null|undefined} team Raw `team` cell.
 * @returns {string|null} Canonical team name, or null when the cell is empty.
 */
export function canonicalizeTeamName(team) {
  const raw = String(team ?? '').trim();
  if (!raw) return null;

  const members = raw
    .split(MEMBER_SEPARATORS)
    .map((m) => m.trim())
    .filter(Boolean);

  if (members.length < 2) return raw.replaceAll(/\s+/g, ' ');

  return members
    .map((m) => m.replaceAll(/\s+/g, ' '))
    .sort((a, b) => a.localeCompare(b, 'he'))
    .join(' + ');
}
