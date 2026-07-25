export const PANEL_IDS = Object.freeze(['report-build', 'send-evidence', 'settings', 'chat', 'docs']);

/** @type {Record<string, string>} */
export const PANEL_PATHS = Object.freeze({
  'report-build': '/panel/report-build',
  'send-evidence': '/panel/send-evidence',
  settings: '/panel/settings',
  chat: '/panel/chat',
  docs: '/panel/docs',
});

/**
 * @param {{ type?: string, id?: string, label?: string } | null | undefined} reportScope
 * @param {string} [reportGeoScope]
 * @returns {string}
 */
export function buildChatPanelPath(reportScope, reportGeoScope, initialMessage) {
  const params = new URLSearchParams();
  if (reportScope?.type === 'component' && reportScope.id) {
    params.set('scope', 'component');
    params.set('id', reportScope.id);
    if (reportScope.label) params.set('label', reportScope.label);
  } else {
    params.set('scope', 'all');
  }
  if (reportGeoScope && reportGeoScope !== 'national') {
    params.set('geo', reportGeoScope);
  }
  const msg = String(initialMessage ?? '').trim();
  if (msg) params.set('q', msg.slice(0, 500));
  const qs = params.toString();
  return qs ? `${PANEL_PATHS.chat}?${qs}` : PANEL_PATHS.chat;
}

/**
 * @param {string | null | undefined} search
 * @returns {{ type: string, id?: string, label?: string, reportGeoScope?: string }}
 */
export function parseChatReportScope(search) {
  const params = new URLSearchParams(String(search ?? ''));
  const reportGeoScope = params.get('geo') === 'north' ? 'north' : 'national';
  const initialMessage = String(params.get('q') ?? '').trim() || null;
  if (params.get('scope') === 'component') {
    const id = params.get('id');
    if (id) {
      return {
        type: 'component',
        id,
        label: params.get('label') ?? id,
        reportGeoScope,
        initialMessage,
      };
    }
  }
  return { type: 'all', reportGeoScope, initialMessage };
}

/**
 * @param {string | null | undefined} slug
 * @returns {string}
 */
export function buildDocsPanelPath(slug) {
  const params = new URLSearchParams();
  const trimmed = String(slug ?? '').trim();
  if (trimmed) params.set('slug', trimmed);
  const qs = params.toString();
  return qs ? `${PANEL_PATHS.docs}?${qs}` : PANEL_PATHS.docs;
}

/**
 * @param {string | null | undefined} search
 * @returns {string | null}
 */
export function parseDocsSlug(search) {
  const slug = new URLSearchParams(String(search ?? '')).get('slug');
  const trimmed = slug?.trim();
  return trimmed || null;
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
