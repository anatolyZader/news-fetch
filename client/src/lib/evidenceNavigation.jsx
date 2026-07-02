import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { isEvidenceAnchorHref } from '../../../cross-cut-modules/resilience-contracts/evidenceAnchor.js';
import { isSafeMarkdownHref } from './safeMarkdownHref.js';

const EvidenceNavigationContext = createContext(null);

/**
 * @param {object} props
 */
export function EvidenceNavigationProvider({ children, onNavigateToAnchor }) {
  const value = useMemo(() => ({ onNavigateToAnchor }), [onNavigateToAnchor]);
  return (
    <EvidenceNavigationContext.Provider value={value}>
      {children}
    </EvidenceNavigationContext.Provider>
  );
}

EvidenceNavigationProvider.propTypes = {
  children: PropTypes.node,
  onNavigateToAnchor: PropTypes.func,
};

export function useEvidenceNavigation() {
  return useContext(EvidenceNavigationContext);
}

/**
 * Markdown link: in-page evidence anchors vs external http links.
 */
export function EvidenceAnchorLink({ href, children, ...rest }) {
  const ctx = useEvidenceNavigation();
  if (!isSafeMarkdownHref(href)) {
    return createElement('span', rest, children);
  }
  if (isEvidenceAnchorHref(href)) {
    return createElement(
      'a',
      {
        href,
        ...rest,
        onClick: (event) => {
          event.preventDefault();
          ctx?.onNavigateToAnchor?.(href);
        },
      },
      children,
    );
  }
  return createElement(
    'a',
    { href, rel: 'noopener noreferrer', target: '_blank', ...rest },
    children,
  );
}

EvidenceAnchorLink.propTypes = {
  href: PropTypes.string,
  children: PropTypes.node,
};

/**
 * @returns {object}
 */
export function evidenceNavigationMarkdownComponents() {
  return { a: EvidenceAnchorLink };
}

/**
 * @param {object} [overrides]
 * @returns {object}
 */
export function mergeEvidenceNavigationMarkdownComponents(overrides = {}) {
  return { a: EvidenceAnchorLink, ...overrides };
}

/**
 * Scroll evidence row into vertical center; repeat after accordion animations settle.
 * @param {string} anchorId
 * @param {{ transitionMs?: number }} [opts]
 */
export function scrollEvidenceAnchorIntoView(anchorId, { transitionMs = 300 } = {}) {
  const scroll = () => {
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
    return el;
  };

  globalThis.setTimeout(scroll, 80);
  globalThis.setTimeout(scroll, transitionMs + 60);
  globalThis.setTimeout(scroll, transitionMs + 220);
}

/**
 * @param {() => void} openEvidenceAccordion
 * @param {(bucket: string) => void} openSourceGroup
 * @param {(anchorId: string) => void} [onHighlightAnchor]
 * @param {{
 *   transitionMs?: number,
 *   resolveAnchorTarget?: (anchorId: string) => { bucket?: string|null, inFullPoolOnly?: boolean },
 *   openFullPoolAccordion?: () => void,
 * }} [opts]
 * @returns {(href: string) => void}
 */
export function createEvidenceAnchorNavigator(
  openEvidenceAccordion,
  openSourceGroup,
  onHighlightAnchor,
  opts = {},
) {
  const {
    transitionMs = 300,
    resolveAnchorTarget,
    openFullPoolAccordion,
  } = opts;

  return (href) => {
    const anchorId = String(href ?? '').trim().replace(/^#/, '');
    if (!anchorId) return;

    onHighlightAnchor?.(anchorId);
    openEvidenceAccordion?.();

    const resolved = resolveAnchorTarget?.(anchorId);
    if (resolved?.inFullPoolOnly) {
      openFullPoolAccordion?.();
    }

    const bucket = resolved?.bucket
      ?? document.getElementById(anchorId)?.dataset?.sourceBucket
      ?? null;
    if (bucket) openSourceGroup?.(bucket);

    scrollEvidenceAnchorIntoView(anchorId, { transitionMs });
  };
}

/**
 * @returns {{ expandedSourceGroups: Set<string>, openSourceGroup: (bucket: string) => void, toggleSourceGroup: (bucket: string, expanded: boolean) => void }}
 */
export function useExpandedSourceGroups() {
  const [expanded, setExpanded] = useState(() => new Set());

  const openSourceGroup = useCallback((bucket) => {
    if (!bucket) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(bucket);
      return next;
    });
  }, []);

  const toggleSourceGroup = useCallback((bucket, isExpanded) => {
    if (!bucket) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isExpanded) next.add(bucket);
      else next.delete(bucket);
      return next;
    });
  }, []);

  return { expandedSourceGroups: expanded, openSourceGroup, toggleSourceGroup };
}
