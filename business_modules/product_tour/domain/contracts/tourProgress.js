/**
 * Tour progress semantics: normalization, tier filtering, auto-start policy.
 *
 * Pipeline position: onboarding display (server + client) — shared rules for
 * what a progress record means and when the tour should launch on its own.
 * Client-safe isomorphic.
 *
 * Owns: TOUR_STATUSES, normalizeProgress, filterStepsForTier, shouldAutoStart.
 * Does NOT: step registry (tourDefinitions.js) or persistence transport.
 *
 * Key collaborators: client/src/tour/TourProvider.jsx, app/tourService.js.
 */

export const TOUR_STATUSES = Object.freeze(['in_progress', 'completed', 'dismissed']);

export const MAX_STEP_INDEX = 99;

/**
 * Coerce an untrusted progress record into a canonical shape, or null.
 * @param {any} raw
 * @returns {{ tourId: string, status: string, lastStepIndex: number, seenVersion: number, completedAt: string|null } | null}
 */
export function normalizeProgress(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const tourId = String(raw.tourId ?? '').trim();
  const status = String(raw.status ?? '').trim();
  if (!tourId || !TOUR_STATUSES.includes(status)) return null;
  const idx = Number(raw.lastStepIndex);
  const version = Number(raw.seenVersion);
  return {
    tourId,
    status,
    lastStepIndex: Number.isInteger(idx) ? Math.min(Math.max(idx, 0), MAX_STEP_INDEX) : 0,
    seenVersion: Number.isInteger(version) && version >= 1 ? version : 1,
    completedAt: raw.completedAt ? String(raw.completedAt) : null,
  };
}

/**
 * Steps applicable to the current layout tier.
 * @param {Array<{ tiers: string[] }>} steps
 * @param {{ isDesktop: boolean }} tier
 */
export function filterStepsForTier(steps, { isDesktop }) {
  const tier = isDesktop ? 'desktop' : 'mobile';
  return (steps ?? []).filter((s) => s.tiers?.includes(tier));
}

/**
 * Auto-start policy:
 *  - no record → start fresh
 *  - in_progress at the current version → resume at lastStepIndex
 *  - completed at an older version → re-offer from the top
 *  - dismissed → never auto-start again (replay stays available)
 * @param {ReturnType<typeof normalizeProgress>} progress
 * @param {{ version: number }} definition
 * @returns {{ start: boolean, resumeAt: number }}
 */
export function shouldAutoStart(progress, definition) {
  if (!progress) return { start: true, resumeAt: 0 };
  if (progress.status === 'dismissed') return { start: false, resumeAt: 0 };
  if (progress.status === 'in_progress') {
    if (progress.seenVersion === definition.version) {
      return { start: true, resumeAt: progress.lastStepIndex };
    }
    return { start: true, resumeAt: 0 };
  }
  if (progress.status === 'completed' && progress.seenVersion < definition.version) {
    return { start: true, resumeAt: 0 };
  }
  return { start: false, resumeAt: 0 };
}
