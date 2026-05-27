export const PANEL_IDS = Object.freeze(['report-build', 'send-evidence', 'settings']);

/** @type {Record<string, string>} */
export const PANEL_PATHS = Object.freeze({
  'report-build': '/panel/report-build',
  'send-evidence': '/panel/send-evidence',
  settings: '/panel/settings',
});

/**
 * @param {string | null | undefined} id
 * @returns {boolean}
 */
export function isKnownPanelId(id) {
  return PANEL_IDS.includes(id);
}

/**
 * @param {string | null | undefined} pathname
 * @returns {string | null}
 */
export function parsePanelPath(pathname) {
  const match = /^\/panel\/([^/]+)\/?$/.exec(String(pathname ?? ''));
  if (!match) return null;
  const id = match[1];
  return isKnownPanelId(id) ? id : null;
}

/**
 * @param {string} id
 * @returns {string | null}
 */
export function panelPathForId(id) {
  if (!isKnownPanelId(id)) return null;
  return PANEL_PATHS[id];
}
