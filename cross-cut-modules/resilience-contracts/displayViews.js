/** Display tiers for resilience assessments (operator vs analyst). */
export const DISPLAY_VIEWS = Object.freeze({
  operator: 'operator',
  analyst: 'analyst',
});

/**
 * @param {{ queryView?: string, canViewAnalyst?: boolean }} opts
 * @returns {'operator' | 'analyst'}
 */
export function resolveDisplayView({ queryView, canViewAnalyst = false } = {}) {
  const requested = String(queryView ?? 'operator').trim().toLowerCase();
  if (requested !== DISPLAY_VIEWS.analyst) {
    return DISPLAY_VIEWS.operator;
  }
  return canViewAnalyst ? DISPLAY_VIEWS.analyst : DISPLAY_VIEWS.operator;
}
