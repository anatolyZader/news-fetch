/**
 * Tour progress persistence: localStorage is always written synchronously
 * (per-browser fallback and StrictMode/offline guard); the server copy is the
 * source of truth on read when the user is signed in.
 */
import { authFetch } from '../lib/authFetch.js';
import { normalizeProgress } from '../../../business_modules/product_tour/domain/contracts/index.js';

const LS_PREFIX = 'vibes-witch:tour:';

export function readLocalProgress(tourId) {
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + tourId);
    return raw ? normalizeProgress(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeLocalProgress(tourId, progress) {
  try {
    window.localStorage.setItem(LS_PREFIX + tourId, JSON.stringify(progress));
  } catch {
    /* storage unavailable — tour still works, just re-offers */
  }
}

/**
 * @param {{ user?: object, getIdToken?: Function, getAppCheckToken?: Function }} auth
 * @returns {Promise<ReturnType<typeof normalizeProgress>>}
 */
export async function loadProgress(auth, tourId) {
  if (auth?.user && auth.getIdToken) {
    try {
      const data = await authFetch(`/api/tour/progress?tourId=${encodeURIComponent(tourId)}`, {
        getIdToken: auth.getIdToken,
        getAppCheckToken: auth.getAppCheckToken,
      });
      return normalizeProgress(data?.progress);
    } catch {
      /* server unreachable — fall back to the local copy */
    }
  }
  return readLocalProgress(tourId);
}

export function saveProgress(auth, tourId, { status, lastStepIndex, seenVersion }) {
  const progress = { tourId, status, lastStepIndex, seenVersion, completedAt: null };
  writeLocalProgress(tourId, progress);
  if (auth?.user && auth.getIdToken) {
    authFetch('/api/tour/progress', {
      method: 'PUT',
      getIdToken: auth.getIdToken,
      getAppCheckToken: auth.getAppCheckToken,
      body: { tourId, status, lastStepIndex, seenVersion },
    }).catch(() => {});
  }
}
