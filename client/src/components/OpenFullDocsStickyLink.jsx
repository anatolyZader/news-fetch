import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Link from '@mui/material/Link';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { alpha, keyframes } from '@mui/material/styles';

// Testing: flash every 10s. Production: 60s for first 10 min, then 5 min.
const FLASH_INTERVAL_MS = 10 * 1000;
const FLASH_MS = 1400;

const docsFullFlash = keyframes`
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 2px 8px rgba(59, 91, 160, 0.12);
  }
  35%, 65% {
    transform: scale(1.04);
    box-shadow: 0 0 0 3px rgba(99, 130, 210, 0.45), 0 4px 16px rgba(59, 91, 160, 0.28);
  }
`;

function prefersReducedMotion() {
  if (typeof globalThis.matchMedia !== 'function') return false;
  return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scheduleFlashEnd(setAnimating, timersRef) {
  const offId = setTimeout(() => setAnimating(false), FLASH_MS);
  timersRef.current.push(offId);
}

function runFlashAnimation(setAnimating, timersRef) {
  setAnimating(false);
  const startId = requestAnimationFrame(() => {
    setAnimating(true);
    scheduleFlashEnd(setAnimating, timersRef);
  });
  timersRef.current.push(startId);
}

function useFullDocsFlash(active) {
  const [animating, setAnimating] = useState(false);
  const timersRef = useRef([]);

  useEffect(() => {
    if (!active) {
      timersRef.current.forEach(cancelAnimationFrame);
      timersRef.current.forEach(clearTimeout);
      timersRef.current.forEach(clearInterval);
      timersRef.current = [];
      return undefined;
    }

    const reducedMotion = prefersReducedMotion();

    const clearTimers = () => {
      for (const id of timersRef.current) {
        cancelAnimationFrame(id);
        clearTimeout(id);
        clearInterval(id);
      }
      timersRef.current = [];
    };

    const triggerFlash = () => {
      if (reducedMotion) return;
      runFlashAnimation(setAnimating, timersRef);
    };

    triggerFlash();
    const intervalId = setInterval(triggerFlash, FLASH_INTERVAL_MS);
    timersRef.current.push(intervalId);

    return () => {
      clearInterval(intervalId);
      clearTimers();
    };
  }, [active]);

  return active ? animating : false;
}

function stickyLinkLayout({ useInlinePin, useFixedPin, theme }) {
  if (useInlinePin) {
    return { position: 'static', top: undefined, right: undefined, zIndex: undefined };
  }
  if (useFixedPin) {
    return {
      position: 'fixed',
      top: theme.spacing(8.5),
      right: theme.spacing(1.25),
      zIndex: 1400,
    };
  }
  return {
    position: 'absolute',
    top: theme.spacing(1.25),
    right: theme.spacing(1.25),
    zIndex: 20,
  };
}

export function OpenFullDocsStickyLink({ href, label, active, pin = 'overlay' }) {
  const animating = useFullDocsFlash(active);
  const useFixedPin = pin === 'fixed';
  const useInlinePin = pin === 'inline';

  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      underline="none"
      sx={(theme) => ({
        ...stickyLinkLayout({ useInlinePin, useFixedPin, theme }),
        pointerEvents: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing(0.5),
        fontSize: theme.typography.body2.fontSize,
        fontWeight: 600,
        color: theme.palette.primary.dark,
        border: theme.custom.border.hairline,
        borderColor: alpha(theme.palette.primary.main, animating ? 0.65 : 0.28),
        paddingTop: theme.spacing(0.625),
        paddingBottom: theme.spacing(0.625),
        paddingLeft: theme.spacing(1),
        paddingRight: theme.spacing(1),
        borderRadius: `${theme.custom.radius.section}px`,
        backgroundColor: alpha(
          animating ? theme.custom.pastel.periwinkleLight : theme.palette.background.paper,
          animating ? 0.95 : 0.96,
        ),
        backdropFilter: 'blur(6px)',
        boxShadow: animating
          ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.35)}, 0 4px 16px ${alpha(theme.palette.primary.main, 0.22)}`
          : theme.custom.elevation.subtle,
        animation: animating ? `${docsFullFlash} ${FLASH_MS}ms ease-in-out` : 'none',
        ...(useInlinePin ? null : {
          [theme.breakpoints.down('sm')]: useFixedPin ? {
            top: theme.spacing(7),
          } : {
            top: theme.spacing(0.5),
          },
        }),
        '&:hover': {
          color: theme.palette.primary.main,
          backgroundColor: alpha(theme.custom.pastel.periwinkleLight, 0.65),
        },
        '& .MuiSvgIcon-root': {
          fontSize: '1rem',
          opacity: 0.85,
        },
      })}
    >
      {label}
      <OpenInNewRoundedIcon aria-hidden />
    </Link>
  );
}

OpenFullDocsStickyLink.propTypes = {
  href: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  active: PropTypes.bool.isRequired,
  pin: PropTypes.oneOf(['fixed', 'overlay', 'inline']),
};
