import { buildChatPanelPath, isKnownPanelId, panelPathForId } from './panelRoutes.js';

/** @type {Record<string, { width: number, height: number }>} */
const PANEL_SPECS = Object.freeze({
  'report-build': { width: 920, height: 680 },
  'send-evidence': { width: 920, height: 680 },
  settings: { width: 720, height: 640 },
  chat: { width: 480, height: 720 },
});

/**
 * @param {string} panelId
 * @returns {string}
 */
export function popupWindowName(panelId) {
  return `vibes-witch-${panelId}`;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} left
 * @param {number} top
 * @returns {string}
 */
export function buildPopupFeatures(width, height, left, top) {
  return [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {{ left: number, top: number }}
 */
export function computePopupPosition(width, _height) {
  const win = globalThis.window;
  if (!win) return { left: 100, top: 80 };
  const left = win.screenX + Math.max(0, Math.floor((win.outerWidth - width) / 2));
  const top = win.screenY + 80;
  return { left, top };
}

/**
 * @param {string} panelId
 * @param {Window | null | undefined} existingWindow
 * @param {{ reportScope?: { type?: string, id?: string, label?: string } }} [options]
 * @returns {Window | null}
 */
export function openPanelPopup(panelId, existingWindow, options = {}) {
  if (!isKnownPanelId(panelId)) return null;
  if (existingWindow && !existingWindow.closed) {
    existingWindow.focus();
    return existingWindow;
  }
  const path = panelId === 'chat'
    ? buildChatPanelPath(options.reportScope)
    : panelPathForId(panelId);
  const spec = PANEL_SPECS[panelId];
  if (!path || !spec) return null;
  const { left, top } = computePopupPosition(spec.width, spec.height);
  const features = buildPopupFeatures(spec.width, spec.height, left, top);
  const name = popupWindowName(panelId);
  return globalThis.window?.open(path, name, features) ?? null;
}

export { PANEL_SPECS };
