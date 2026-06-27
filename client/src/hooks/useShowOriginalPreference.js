const STORAGE_KEY = 'locale.showOriginalGlobal';

/**
 * @returns {boolean}
 */
export function readShowOriginalPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * @param {boolean} value
 */
export function writeShowOriginalPreference(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}
