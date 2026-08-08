/**
 * Display view resolution for user vs developer report tiers.
 *
 * Pipeline position: report HTTP and client — selects redaction/display tier
 * from query params and auth capability. Client-safe isomorphic.
 *
 * Owns: DISPLAY_VIEWS constants and resolveDisplayView gate.
 * Does NOT: actual redaction (passthrough in min-math fork) or assessment content.
 *
 * Key collaborators: reportRoutes.js, client report shell, reportCacheService.js.
 */

/** Requested display tiers for resilience assessments (user vs developer). */
export const DISPLAY_VIEWS = Object.freeze({
  user: 'user',
  developer: 'developer',
});

/**
 * Resolve the effective display view, falling back to user when developer
 * is requested without permission.
 * @param {{ queryView?: string, canViewDeveloper?: boolean }} opts
 * @returns {'user' | 'developer'}
 */
export function resolveDisplayView({ queryView, canViewDeveloper = false } = {}) {
  const requested = String(queryView ?? 'user').trim().toLowerCase();
  if (requested !== DISPLAY_VIEWS.developer) {
    return DISPLAY_VIEWS.user;
  }
  return canViewDeveloper ? DISPLAY_VIEWS.developer : DISPLAY_VIEWS.user;
}
