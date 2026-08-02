/**
 * Application service for tour progress: validates untrusted input against the
 * contracts and delegates persistence to the injected store.
 */
import { KNOWN_TOUR_IDS } from '../domain/contracts/tourDefinitions.js';
import { TOUR_STATUSES, MAX_STEP_INDEX } from '../domain/contracts/tourProgress.js';

/**
 * @param {{ store: ReturnType<import('../infrastructure/tourProgressStore.js').createTourProgressStore> }} deps
 */
export function createTourService({ store }) {
  if (!store) throw new Error('createTourService: store required');

  return {
    /**
     * @returns {{ tourId: string, progress: object|null } | { error: string, code: number }}
     */
    getProgress({ userUid, tourId }) {
      const tour = validateTourId(tourId);
      if (tour.error) return tour;
      return { tourId: tour.value, progress: store.getByUid(userUid, tour.value) };
    },

    /**
     * @returns {{ tourId: string, progress: object } | { error: string, code: number }}
     */
    saveProgress({ userUid, tourId, status, lastStepIndex, seenVersion }) {
      const tour = validateTourId(tourId);
      if (tour.error) return tour;
      if (!TOUR_STATUSES.includes(status)) {
        return { error: `status must be one of: ${TOUR_STATUSES.join(', ')}`, code: 400 };
      }
      const idx = lastStepIndex === undefined ? 0 : lastStepIndex;
      if (!Number.isInteger(idx) || idx < 0 || idx > MAX_STEP_INDEX) {
        return { error: `lastStepIndex must be an integer between 0 and ${MAX_STEP_INDEX}`, code: 400 };
      }
      const version = seenVersion === undefined ? 1 : seenVersion;
      if (!Number.isInteger(version) || version < 1) {
        return { error: 'seenVersion must be an integer >= 1', code: 400 };
      }
      const progress = store.upsert({
        userUid,
        tourId: tour.value,
        status,
        lastStepIndex: idx,
        seenVersion: version,
      });
      return { tourId: tour.value, progress };
    },
  };
}

function validateTourId(tourId) {
  const value = String(tourId ?? '').trim();
  if (!KNOWN_TOUR_IDS.includes(value)) {
    return { error: `Unknown tourId (known: ${KNOWN_TOUR_IDS.join(', ')})`, code: 400 };
  }
  return { value };
}
