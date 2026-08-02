/**
 * DOM anchor resolution for tour steps: find the visible element carrying a
 * data-tour attribute, waiting for it to appear when a tab switch or lazy
 * render is in flight.
 */
import { anchorSelector } from '../../../business_modules/product_tour/domain/contracts/index.js';

export function isElementVisible(el) {
  if (!el || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * Desktop and mobile variants of the same concept share one anchor value;
 * pick whichever is actually rendered and visible.
 */
export function findVisibleAnchor(anchor) {
  const nodes = document.querySelectorAll(anchorSelector(anchor));
  for (const el of nodes) {
    if (isElementVisible(el)) return el;
  }
  return null;
}

/**
 * Resolve the anchor element, waiting up to timeoutMs for it to appear.
 * Resolves null on timeout — callers skip the step gracefully.
 * @returns {Promise<Element|null>}
 */
export function waitForAnchor(anchor, { timeoutMs = 3000 } = {}) {
  const found = findVisibleAnchor(anchor);
  if (found) return Promise.resolve(found);

  return new Promise((resolve) => {
    let done = false;
    const finish = (el) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(timer);
      resolve(el);
    };
    const check = () => {
      const el = findVisibleAnchor(anchor);
      if (el) finish(el);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    // Fallback for visibility flips that mutate no attributes MutationObserver sees
    const interval = setInterval(check, 250);
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}
