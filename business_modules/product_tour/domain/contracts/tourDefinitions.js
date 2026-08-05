/**
 * Tour step registry for the onboarding product tour.
 *
 * Pipeline position: onboarding display (server + client) — single source of
 * truth for tour ids, step order, DOM anchors, and versioning. Client-safe
 * isomorphic; holds NO translated copy (steps carry i18n key bases only).
 *
 * Owns: MAIN_SHELL_TOUR definition, anchorSelector, tour lookup by id.
 * Does NOT: progress persistence rules (tourProgress.js) or rendering.
 *
 * Key collaborators: client/src/tour/ engine, app/tourService.js validation.
 */

export const MAIN_SHELL_TOUR_ID = 'main-shell';

/**
 * Bump ONLY when steps change materially enough that users who completed an
 * older version should be offered the tour again (see shouldAutoStart).
 */
export const MAIN_SHELL_TOUR_VERSION = 3;

export const TOUR_TIERS = Object.freeze(['desktop', 'mobile']);

/**
 * Step shape:
 *  - id: stable step slug (also the i18n key segment)
 *  - anchor: value of the target's data-tour attribute
 *  - tiers: layout tiers where the step applies
 *  - requiresTab: MainApp activeTab that must be active before anchoring, or null
 *  - optional: anchor may legitimately be absent (skip silently on timeout)
 *  - prepare: UI action slug the host app performs on step entry (e.g. open an
 *    accordion so the anchor becomes visible), or absent
 *  - instant: anchor is either visible right now or never will be on this tier
 *    (always-mounted element) — skip immediately instead of waiting
 *  - extraAnchors: additional data-tour anchors spotlighted alongside the main
 *    one (extra scrim holes, best-effort — missing/hidden ones are ignored)
 */
export const MAIN_SHELL_TOUR = Object.freeze({
  id: MAIN_SHELL_TOUR_ID,
  version: MAIN_SHELL_TOUR_VERSION,
  steps: Object.freeze([
    { id: 'welcome', anchor: 'brand-header', tiers: ['desktop', 'mobile'], requiresTab: null, optional: false },
    { id: 'scope-toggle', anchor: 'scope-toggle', tiers: ['desktop', 'mobile'], requiresTab: 'report', optional: true },
    { id: 'edition-picker', anchor: 'edition-picker', tiers: ['desktop', 'mobile'], requiresTab: 'report', optional: true },
    { id: 'report-contents', anchor: 'report-contents', tiers: ['desktop', 'mobile'], requiresTab: 'report', optional: true },
    { id: 'component-narrative', anchor: 'component-narrative', tiers: ['desktop', 'mobile'], requiresTab: 'report', optional: true, extraAnchors: ['contents-showcase'] },
    { id: 'component-evidence', anchor: 'component-evidence', tiers: ['desktop', 'mobile'], requiresTab: 'report', optional: true, extraAnchors: ['contents-showcase'] },
    { id: 'data-sources', anchor: 'data-sources', tiers: ['desktop', 'mobile'], requiresTab: null, optional: false },
    { id: 'source-pbo-reports', anchor: 'source-tab-pbo-reports', tiers: ['desktop', 'mobile'], requiresTab: null, optional: true, instant: true },
    { id: 'source-report-bot', anchor: 'source-tab-report-bot', tiers: ['desktop', 'mobile'], requiresTab: null, optional: true, instant: true },
    { id: 'source-visits', anchor: 'source-tab-visits', tiers: ['desktop', 'mobile'], requiresTab: null, optional: true, instant: true },
    { id: 'source-news', anchor: 'source-tab-news', tiers: ['desktop', 'mobile'], requiresTab: null, optional: true, instant: true },
    { id: 'source-radio', anchor: 'source-tab-radio', tiers: ['desktop', 'mobile'], requiresTab: null, optional: true, instant: true },
    { id: 'source-social-media', anchor: 'source-tab-social-media', tiers: ['desktop', 'mobile'], requiresTab: null, optional: true, instant: true },
    { id: 'source-pools', anchor: 'source-tab-pools', tiers: ['desktop', 'mobile'], requiresTab: null, optional: true, instant: true },
    { id: 'source-trends', anchor: 'source-tab-trends', tiers: ['desktop', 'mobile'], requiresTab: null, optional: true, instant: true },
    { id: 'write-report', anchor: 'write-report', tiers: ['desktop'], requiresTab: null, optional: true },
    { id: 'send-evidence', anchor: 'send-evidence', tiers: ['desktop'], requiresTab: null, optional: true },
    { id: 'chat', anchor: 'chat-launcher', tiers: ['desktop', 'mobile'], requiresTab: null, optional: true },
    { id: 'finale', anchor: 'tour-replay-item', tiers: ['desktop', 'mobile'], requiresTab: null, optional: false },
  ].map(Object.freeze)),
});

export const KNOWN_TOURS = Object.freeze({
  [MAIN_SHELL_TOUR_ID]: MAIN_SHELL_TOUR,
});

export const KNOWN_TOUR_IDS = Object.freeze(Object.keys(KNOWN_TOURS));

/**
 * @param {string} tourId
 * @returns {typeof MAIN_SHELL_TOUR | null}
 */
export function getTourDefinition(tourId) {
  return KNOWN_TOURS[String(tourId ?? '').trim()] ?? null;
}

/**
 * CSS selector for a step anchor.
 * @param {string} anchor
 * @returns {string}
 */
export function anchorSelector(anchor) {
  return `[data-tour="${String(anchor ?? '').trim()}"]`;
}
