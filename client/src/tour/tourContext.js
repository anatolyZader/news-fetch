import { createContext, useContext } from 'react';

export const TourContext = createContext(null);

/**
 * @returns {{
 *   isRunning: boolean,
 *   stepIndex: number,
 *   totalSteps: number,
 *   startTour: (opts?: { replay?: boolean }) => void,
 * }}
 */
export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTour must be used within TourProvider');
  }
  return ctx;
}

/**
 * Like useTour, but returns null outside a TourProvider — for components also
 * rendered in trees without a tour (login screen, popup panel windows).
 */
export function useTourOptional() {
  return useContext(TourContext);
}
