import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import PropTypes from 'prop-types';
import {
  MAIN_SHELL_TOUR,
  MAIN_SHELL_TOUR_ID,
  MAIN_SHELL_TOUR_VERSION,
  filterStepsForTier,
  shouldAutoStart,
} from '../../../business_modules/product_tour/domain/contracts/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { TourContext } from './tourContext.js';
import { TourOverlay } from './TourOverlay.jsx';
import { waitForAnchor } from './anchors.js';
import { loadProgress, saveProgress, writeLocalProgress } from './progressStorage.js';

const SCROLL_SETTLE_MS = 380;
const SCROLL_SETTLE_REDUCED_MS = 60;

/**
 * Walk from startIndex in the travel direction until a step's anchor resolves,
 * skipping steps whose anchor never appears (hidden tier variants, markdown-only
 * reports). Returns { cancelled } | { outOfRange } | { completed } | { index, step, el }.
 */
async function findPresentableStep(steps, startIndex, direction, { onEnterStep, isCancelled }) {
  let index = Math.max(startIndex, 0);
  while (index < steps.length) {
    const step = steps[index];
    onEnterStep(step);
    let stepTimeoutMs = step.optional ? 3000 : 5000;
    if (step.instant) stepTimeoutMs = 0;
    const el = await waitForAnchor(step.anchor, { timeoutMs: stepTimeoutMs });
    if (isCancelled()) return { cancelled: true };
    if (el) return { index, step, el };
    index += direction >= 0 ? 1 : -1;
    if (index < 0) return { outOfRange: true };
  }
  return { completed: true };
}

/**
 * Owns the tour lifecycle: auto-start policy, step navigation (tab switching,
 * anchor waiting, scroll), keyboard handling, and progress persistence.
 */
export function TourProvider({ isDesktop, activeTab, setActiveTab, ready, onPrepareStep = null, children }) {
  const theme = useTheme();
  const auth = useAuth();
  const { t } = useLanguage();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const steps = useMemo(
    () => filterStepsForTier(MAIN_SHELL_TOUR.steps, { isDesktop }),
    [isDesktop],
  );

  const [tour, setTour] = useState({ running: false, stepIndex: 0, targetEl: null });

  // Refs so async step transitions read fresh values without re-binding callbacks
  const stepsRef = useRef(steps);
  const activeTabRef = useRef(activeTab);
  const authRef = useRef(auth);
  const reducedMotionRef = useRef(reducedMotion);
  const onPrepareStepRef = useRef(onPrepareStep);
  const navTokenRef = useRef(0);
  const autoStartAttemptedRef = useRef(false);
  const startedOnceRef = useRef(false);
  useEffect(() => {
    stepsRef.current = steps;
    activeTabRef.current = activeTab;
    authRef.current = auth;
    reducedMotionRef.current = reducedMotion;
    onPrepareStepRef.current = onPrepareStep;
  });

  const persist = useCallback((status, lastStepIndex) => {
    saveProgress(authRef.current, MAIN_SHELL_TOUR_ID, {
      status,
      lastStepIndex,
      seenVersion: MAIN_SHELL_TOUR_VERSION,
    });
  }, []);

  const stopTour = useCallback((status, stepIndex) => {
    navTokenRef.current += 1;
    setTour({ running: false, stepIndex: 0, targetEl: null });
    persist(status, stepIndex);
  }, [persist]);

  const goToStep = useCallback(async (startIndex, direction = 1) => {
    const token = ++navTokenRef.current;
    const isCancelled = () => navTokenRef.current !== token;
    const currentSteps = stepsRef.current;
    const result = await findPresentableStep(currentSteps, startIndex, direction, {
      onEnterStep: (step) => {
        if (step.requiresTab && activeTabRef.current !== step.requiresTab) {
          setActiveTab(step.requiresTab);
        }
        if (step.prepare) onPrepareStepRef.current?.(step);
      },
      isCancelled,
    });
    if (result.cancelled || result.outOfRange) return;
    if (result.completed) {
      setTour({ running: false, stepIndex: 0, targetEl: null });
      persist('completed', currentSteps.length - 1);
      return;
    }
    result.el.scrollIntoView({ block: 'center', behavior: reducedMotionRef.current ? 'auto' : 'smooth' });
    await new Promise((resolve) => {
      setTimeout(resolve, reducedMotionRef.current ? SCROLL_SETTLE_REDUCED_MS : SCROLL_SETTLE_MS);
    });
    if (isCancelled()) return;
    setTour({ running: true, stepIndex: result.index, targetEl: result.el });
    persist('in_progress', result.index);
  }, [persist, setActiveTab]);

  const startTour = useCallback(({ resumeAt = 0 } = {}) => {
    startedOnceRef.current = true;
    goToStep(Math.min(resumeAt, Math.max(stepsRef.current.length - 1, 0)), 1);
  }, [goToStep]);

  // Auto-start once, after the report has settled. The ref is set synchronously
  // before any await so React StrictMode's double effect cannot race it, and
  // startedOnceRef guards the actual launch.
  useEffect(() => {
    if (!ready || autoStartAttemptedRef.current) return;
    autoStartAttemptedRef.current = true;
    (async () => {
      const progress = await loadProgress(authRef.current, MAIN_SHELL_TOUR_ID);
      const decision = shouldAutoStart(progress, MAIN_SHELL_TOUR);
      if (decision.start && !startedOnceRef.current) {
        writeLocalProgress(MAIN_SHELL_TOUR_ID, {
          tourId: MAIN_SHELL_TOUR_ID,
          status: 'in_progress',
          lastStepIndex: decision.resumeAt,
          seenVersion: MAIN_SHELL_TOUR_VERSION,
          completedAt: null,
        });
        startTour({ resumeAt: decision.resumeAt });
      }
    })();
  }, [ready, startTour]);

  const handleNext = useCallback(() => {
    const isLast = tour.stepIndex >= stepsRef.current.length - 1;
    if (isLast) {
      stopTour('completed', tour.stepIndex);
      return;
    }
    goToStep(tour.stepIndex + 1, 1);
  }, [tour.stepIndex, goToStep, stopTour]);

  const handleBack = useCallback(() => {
    if (tour.stepIndex <= 0) return;
    goToStep(tour.stepIndex - 1, -1);
  }, [tour.stepIndex, goToStep]);

  const handleDismiss = useCallback(() => {
    stopTour('dismissed', tour.stepIndex);
  }, [tour.stepIndex, stopTour]);

  // Keyboard: Esc dismisses; arrows navigate, mirrored under RTL.
  useEffect(() => {
    if (!tour.running) return undefined;
    const isRtl = theme.direction === 'rtl';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        handleDismiss();
      } else if (event.key === 'ArrowRight') {
        (isRtl ? handleBack : handleNext)();
      } else if (event.key === 'ArrowLeft') {
        (isRtl ? handleNext : handleBack)();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [tour.running, theme.direction, handleNext, handleBack, handleDismiss]);

  // If the layout tier flips mid-tour (device rotation, window resize across
  // the md breakpoint), the step list changes under us — close without
  // persisting so the last saved in_progress state resumes on next load.
  useEffect(() => {
    if (!tour.running) return undefined;
    const id = setTimeout(() => {
      navTokenRef.current += 1;
      setTour({ running: false, stepIndex: 0, targetEl: null });
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  const contextValue = useMemo(() => ({
    isRunning: tour.running,
    stepIndex: tour.stepIndex,
    totalSteps: steps.length,
    startTour,
  }), [tour.running, tour.stepIndex, steps.length, startTour]);

  const currentStep = tour.running ? steps[tour.stepIndex] : null;

  return (
    <TourContext.Provider value={contextValue}>
      {children}
      {currentStep ? (
        <>
          <TourOverlay
            targetEl={tour.targetEl}
            step={currentStep}
            stepNumber={tour.stepIndex + 1}
            totalSteps={steps.length}
            isFirst={tour.stepIndex === 0}
            isLast={tour.stepIndex === steps.length - 1}
            onNext={handleNext}
            onBack={handleBack}
            onSkip={handleDismiss}
          />
          <span
            aria-live="polite"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clipPath: 'inset(50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {t('tour.stepAnnouncement', {
              current: tour.stepIndex + 1,
              total: steps.length,
              title: t(`tour.mainShell.${currentStep.id}.title`),
            })}
          </span>
        </>
      ) : null}
    </TourContext.Provider>
  );
}

TourProvider.propTypes = {
  isDesktop: PropTypes.bool.isRequired,
  activeTab: PropTypes.string.isRequired,
  setActiveTab: PropTypes.func.isRequired,
  ready: PropTypes.bool.isRequired,
  onPrepareStep: PropTypes.func,
  children: PropTypes.node,
};
