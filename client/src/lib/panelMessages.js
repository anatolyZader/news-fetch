export const PANEL_MESSAGE_TYPES = Object.freeze({
  EVIDENCE_SUBMISSION_COMPLETE: 'evidence-submission-complete',
  OPEN_DOCS: 'open-docs',
  PANEL_CLOSED: 'panel-closed',
});

/**
 * @param {string} origin
 * @param {string} expectedOrigin
 * @returns {boolean}
 */
export function isTrustedPanelMessageOrigin(origin, expectedOrigin) {
  return origin === expectedOrigin;
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 * @returns {{ type: string }}
 */
export function createPanelMessage(type, payload = {}) {
  return { type, ...payload };
}

/**
 * @param {unknown} data
 * @returns {{ type: string } | null}
 */
export function parsePanelMessage(data) {
  if (data == null || typeof data !== 'object') return null;
  const type = /** @type {{ type?: unknown }} */ (data).type;
  if (typeof type !== 'string') return null;
  return /** @type {{ type: string }} */ (data);
}

/**
 * @param {{ type: string }} message
 * @returns {boolean}
 */
export function postToOpener(message) {
  const win = globalThis.window;
  if (!win?.opener || win.opener.closed) return false;
  win.opener.postMessage(message, win.location.origin);
  return true;
}
