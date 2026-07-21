/**
 * Display view resolution for operator vs analyst report tiers.
 *
 * Pipeline position: report HTTP and client — selects redaction/display tier
 * from query params and auth capability. Client-safe isomorphic.
 *
 * Owns: DISPLAY_VIEWS constants and resolveDisplayView gate.
 * Does NOT: actual redaction (passthrough in min-math fork) or assessment content.
 *
 * Key collaborators: reportRoutes.js, client report shell, reportCacheService.js.
 */

/** Requested display tiers for resilience assessments (operator vs analyst). */
export const DISPLAY_VIEWS = Object.freeze({
  operator: 'operator',
  analyst: 'analyst',
});

/**
 * Resolve the effective display view, falling back to operator when analyst
 * is requested without permission.
 * @param {{ queryView?: string, canViewAnalyst?: boolean }} opts
 * @returns {'operator' | 'analyst'}
 */
export function resolveDisplayView({ queryView, canViewAnalyst = false } = {}) {
  const requested = String(queryView ?? 'operator').trim().toLowerCase();
  if (requested !== DISPLAY_VIEWS.analyst) {
    return DISPLAY_VIEWS.operator;
  }
  return canViewAnalyst ? DISPLAY_VIEWS.analyst : DISPLAY_VIEWS.operator;
}
