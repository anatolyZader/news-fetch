export const PANEL_IDS = Object.freeze(['report-build', 'send-evidence', 'settings', 'chat']);

/** @type {Record<string, string>} */
export const PANEL_PATHS = Object.freeze({
  'report-build': '/panel/report-build',
  'send-evidence': '/panel/send-evidence',
  settings: '/panel/settings',
  chat: '/panel/chat',
});

/**
 * @param {{ type?: string, id?: string, label?: string } | null | undefined} reportScope
 * @returns {string}
 */
export function buildChatPanelPath(reportScope) {
  const params = new URLSearchParams();
  if (reportScope?.type === 'component' && reportScope.id) {
    params.set('scope', 'component');
    params.set('id', reportScope.id);
    if (reportScope.label) params.set('label', reportScope.label);
  } else {
    params.set('scope', 'all');
  }
  const qs = params.toString();
  return qs ? `${PANEL_PATHS.chat}?${qs}` : PANEL_PATHS.chat;
}

/**
 * @param {string | null | undefined} search
 * @returns {{ type: string, id?: string, label?: string }}
 */
export function parseChatReportScope(search) {
  const params = new URLSearchParams(String(search ?? ''));
  if (params.get('scope') === 'component') {
    const id = params.get('id');
    if (id) {
      return {
        type: 'component',
        id,
        label: params.get('label') ?? id,
      };
    }
  }
  return { type: 'all' };
}

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
