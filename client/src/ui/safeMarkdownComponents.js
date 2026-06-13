/**
 * Safe ReactMarkdown component overrides — block dangerous link schemes.
 */
import { createElement } from 'react';
import PropTypes from 'prop-types';
import { isSafeMarkdownHref } from '../lib/safeMarkdownHref.js';

function SafeLink({ href, children, ...rest }) {
  if (!isSafeMarkdownHref(href)) {
    return createElement('span', rest, children);
  }
  return createElement(
    'a',
    { href, rel: 'noopener noreferrer', target: '_blank', ...rest },
    children,
  );
}

SafeLink.propTypes = {
  href: PropTypes.string,
  children: PropTypes.node,
};

export const safeMarkdownComponents = {
  a: SafeLink,
};

/**
 * Merge caller overrides with safe defaults (caller wins on key collision).
 * @param {object} [overrides]
 * @returns {object}
 */
export function mergeSafeMarkdownComponents(overrides = {}) {
  return { ...safeMarkdownComponents, ...overrides };
}
