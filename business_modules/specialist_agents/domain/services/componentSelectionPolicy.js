/**
 * Which components receive a specialist run vs hard abstention.
 */
import { COMPONENT_IDS } from '../../../resilience_scorer/index.js';
import { shouldAbstainFromInvestigation } from './investigationEpistemic.js';
import { narrativeInvestigationPermissive } from '../../../resilience_scorer/index.js';

function investigationAbstentionOpts() {
  return { narrativePermissive: narrativeInvestigationPermissive() };
}

/**
 * @param {object} params
 * @param {string[]} [params.componentIds]
 * @param {Set<string>} params.abstentionSet
 * @param {string[]} params.focusComponents
 * @param {object} params.epistemicProfileEnriched
 * @returns {string[]}
 */
export function selectSpecialistComponents({
  componentIds = COMPONENT_IDS,
  abstentionSet,
  focusComponents,
  epistemicProfileEnriched,
}) {
  const focus = focusComponents ?? [];
  return componentIds.filter((id) => {
    if (abstentionSet.has(id)) return true;
    if (focus.length === 0 || focus.includes(id)) return true;
    const ep = epistemicProfileEnriched?.by_component?.[id] ?? {};
    if (ep.investigation_eligible === true) return true;
    return !shouldAbstainFromInvestigation(ep, investigationAbstentionOpts());
  });
}
