import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import PropTypes from 'prop-types';
import { TourStepCard } from './TourStepCard.jsx';

const SPOTLIGHT_PADDING = 8;

function measureSpotlight(el) {
  const r = el.getBoundingClientRect();
  // Clip to scroll/overflow ancestors: a target inside a scrollable panel may
  // extend past the panel's box, and a hole over the clipped part would expose
  // unrelated page content behind the panel.
  let { top, left, right, bottom } = r;
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll|hidden)/.test(style.overflowY + style.overflowX)) {
      const c = node.getBoundingClientRect();
      top = Math.max(top, c.top);
      left = Math.max(left, c.left);
      right = Math.min(right, c.right);
      bottom = Math.min(bottom, c.bottom);
    }
  }
  return {
    top: top - SPOTLIGHT_PADDING,
    left: left - SPOTLIGHT_PADDING,
    width: Math.max(right - left, 0) + SPOTLIGHT_PADDING * 2,
    height: Math.max(bottom - top, 0) + SPOTLIGHT_PADDING * 2,
  };
}

/**
 * Full-viewport click-catcher with spotlight "holes" over the current target
 * and any extra co-highlighted targets. The scrim is an SVG rect masked by
 * per-target hole rects — geometry animates via CSS, RTL-agnostic because it
 * works in physical viewport coordinates.
 */
export function TourOverlay({ targetEl, extraTargetEls = [], step, stepNumber, totalSteps, isFirst, isLast, onNext, onBack, onSkip }) {
  const theme = useTheme();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const measureAll = useCallback(() => {
    if (!targetEl?.isConnected) return null;
    return [
      measureSpotlight(targetEl),
      ...extraTargetEls.filter((el) => el?.isConnected).map(measureSpotlight),
    ];
  }, [targetEl, extraTargetEls]);
  const [rects, setRects] = useState(measureAll);
  const frameRef = useRef(0);

  const remeasure = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const next = measureAll();
      if (next) setRects(next);
    });
  }, [measureAll]);

  useEffect(() => {
    if (!targetEl) return undefined;
    remeasure();

    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, { capture: true, passive: true });
    const resizeObserver = new ResizeObserver(remeasure);
    resizeObserver.observe(targetEl);
    for (const el of extraTargetEls) {
      if (el?.isConnected) resizeObserver.observe(el);
    }
    let mutationTimer = 0;
    const mutationObserver = new MutationObserver(() => {
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(remeasure, 120);
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, { capture: true });
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      clearTimeout(mutationTimer);
      cancelAnimationFrame(frameRef.current);
    };
  }, [targetEl, extraTargetEls, remeasure]);

  if (!targetEl || !rects) return null;

  const holeTransition = reducedMotion
    ? 'none'
    : 'x 260ms ease, y 260ms ease, width 260ms ease, height 260ms ease';

  return createPortal(
    <>
      <div
        data-tour-overlay="true"
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: theme.zIndex.tooltip + 20,
          overflow: 'hidden',
        }}
      >
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <mask id="tour-scrim-mask">
              <rect width="100%" height="100%" fill="#fff" />
              {rects.map((r, i) => (
                <rect
                  key={i}
                  x={r.left}
                  y={r.top}
                  width={r.width}
                  height={r.height}
                  rx={theme.custom.radius.section}
                  fill="#000"
                  style={{ transition: holeTransition }}
                />
              ))}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill={theme.custom.surface.tourScrim} mask="url(#tour-scrim-mask)" />
        </svg>
      </div>
      <TourStepCard
        step={step}
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        anchorEl={targetEl}
        isFirst={isFirst}
        isLast={isLast}
        onNext={onNext}
        onBack={onBack}
        onSkip={onSkip}
      />
    </>,
    document.body,
  );
}

TourOverlay.propTypes = {
  targetEl: PropTypes.object,
  extraTargetEls: PropTypes.arrayOf(PropTypes.object),
  step: PropTypes.shape({ id: PropTypes.string.isRequired }).isRequired,
  stepNumber: PropTypes.number.isRequired,
  totalSteps: PropTypes.number.isRequired,
  isFirst: PropTypes.bool.isRequired,
  isLast: PropTypes.bool.isRequired,
  onNext: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
};
