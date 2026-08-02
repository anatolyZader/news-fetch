import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import PropTypes from 'prop-types';
import { TourStepCard } from './TourStepCard.jsx';

const SPOTLIGHT_PADDING = 8;

function measureSpotlight(el) {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - SPOTLIGHT_PADDING,
    left: r.left - SPOTLIGHT_PADDING,
    width: r.width + SPOTLIGHT_PADDING * 2,
    height: r.height + SPOTLIGHT_PADDING * 2,
  };
}

/**
 * Full-viewport click-catcher with a spotlight "hole" over the current target.
 * The hole is a single div whose huge box-shadow paints the scrim everywhere
 * except the target rect — one element, transitions cleanly, RTL-agnostic
 * because it works in physical viewport coordinates.
 */
export function TourOverlay({ targetEl, step, stepNumber, totalSteps, isFirst, isLast, onNext, onBack, onSkip }) {
  const theme = useTheme();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [rect, setRect] = useState(() => (targetEl ? measureSpotlight(targetEl) : null));
  const frameRef = useRef(0);

  const remeasure = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      if (targetEl?.isConnected) setRect(measureSpotlight(targetEl));
    });
  }, [targetEl]);

  useEffect(() => {
    if (!targetEl) return undefined;
    remeasure();

    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, { capture: true, passive: true });
    const resizeObserver = new ResizeObserver(remeasure);
    resizeObserver.observe(targetEl);
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
  }, [targetEl, remeasure]);

  if (!targetEl || !rect) return null;

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
        <div
          style={{
            position: 'fixed',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: theme.custom.radius.section,
            boxShadow: `0 0 0 200vmax ${theme.custom.surface.tourScrim}`,
            pointerEvents: 'none',
            transition: reducedMotion
              ? 'none'
              : 'top 260ms ease, left 260ms ease, width 260ms ease, height 260ms ease',
          }}
        />
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
  step: PropTypes.shape({ id: PropTypes.string.isRequired }).isRequired,
  stepNumber: PropTypes.number.isRequired,
  totalSteps: PropTypes.number.isRequired,
  isFirst: PropTypes.bool.isRequired,
  isLast: PropTypes.bool.isRequired,
  onNext: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
};
