/**
 * Report file ranking for user-facing assessment selection.
 *
 * Pipeline position: report cache and monitoring — picks the best assessment
 * artifact when multiple candidates exist for a date/scope. Client-safe isomorphic.
 *
 * Owns: reportMetaFromAssessment, reportQualityRank, isBetterReportCandidate.
 * Does NOT: filesystem scanning or cache invalidation (reportCacheService.js).
 *
 * Key collaborators: reportCacheService.js, reportPathResolver.js, reportRoutes.js.
 */

/**
 * Extract comparable metadata from a stored assessment for ranking.
 * @param {object} assessment
 * @returns {{ articles: number, assessmentMode: string, quarantineActive: boolean }}
 */
export function reportMetaFromAssessment(assessment) {
  const a = assessment ?? {};
  const articles = a.total_articles_analyzed;
  return {
    articles: typeof articles === 'number' && Number.isFinite(articles) ? articles : 0,
    assessmentMode: a.assessment_mode ?? a.epistemic_status?.assessment_mode ?? 'normal',
    quarantineActive: a.digital_quarantine_state?.active === true,
  };
}

/**
 * Compute a quality rank for report selection (lower is better).
 * @param {{ assessmentMode?: string, quarantineActive?: boolean }} meta
 * @returns {number}
 */
export function reportQualityRank(meta) {
  let rank = 0;
  if (meta.assessmentMode === 'field_anchor_only') rank += 10;
  if (meta.assessmentMode === 'abstained') rank += 20;
  if (meta.quarantineActive) rank += 5;
  return rank;
}

/**
 * Compare two report candidates; prefers lower rank, then more articles, then newer mtime.
 * @param {{ meta: object, mtime: number }} next
 * @param {{ meta: object, mtime: number }} best
 * @returns {boolean}
 */
export function isBetterReportCandidate(next, best) {
  const nextRank = reportQualityRank(next.meta);
  const bestRank = reportQualityRank(best.meta);
  if (nextRank !== bestRank) return nextRank < bestRank;
  if (next.meta.articles !== best.meta.articles) return next.meta.articles > best.meta.articles;
  return next.mtime > best.mtime;
}
