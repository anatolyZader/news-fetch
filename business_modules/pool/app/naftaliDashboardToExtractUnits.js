/**
 * Map Naftali questionnaire week data to open-extract units.
 */
import { normalizeExtractUnits } from '../../signals_extraction/index.js';

const DIMENSION_LABELS = {
  financialRequests: 'Economic hardship requests',
  schoolMentalHealth: 'School mental health referrals',
  communityMentalHealth: 'Community mental health referrals',
  parentalStress: 'Parental stress referrals',
  coupleConflicts: 'Couple conflict referrals',
  parentChildConflicts: 'Parent-child conflict referrals',
};

const VULN_LABELS = {
  physicalDisability: 'Physical disability',
  mentalDisability: 'Mental disability',
  specialEducation: 'Special education',
  domesticViolence: 'Domestic violence',
  severeFinancial: 'Severe financial hardship',
  singleParent: 'Single parent',
};

const FREETEXT_KEYS = [
  'volunteerInitiatives',
  'volunteerNeeds',
  'volunteerCoordination',
  'staffShortage',
  'mainChallenge',
  'urgentNeeds',
];

/**
 * @param {object} week — naftali dashboard week
 * @returns {Array<object>}
 */
export function naftaliWeekToExtractUnits(week) {
  const units = [];
  let idx = 0;

  for (const resp of week.responses ?? []) {
    idx += 1;
    const lines = [];

    for (const [key, label] of Object.entries(DIMENSION_LABELS)) {
      const sev = resp.severity?.[key];
      if (!sev || sev === 'unknown') continue;
      lines.push(`[${resp.municipality}] ${label}: ${sev}`);
    }

    const vulnParts = Object.entries(resp.vulnerable ?? {})
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${VULN_LABELS[k] ?? k}: ${v}`);
    if (vulnParts.length) {
      lines.push(`[${resp.municipality}] Vulnerable populations: ${vulnParts.join(', ')}`);
    }

    for (const key of FREETEXT_KEYS) {
      const text = String(resp.freeText?.[key] ?? '').trim();
      if (text) lines.push(`[${resp.municipality}] ${key}: ${text}`);
    }

    if (!lines.length) continue;
    units.push({
      title: resp.municipality,
      source: `naftali-${resp.municipality}`,
      body: lines.join('\n'),
      article_index: idx,
    });
  }

  return normalizeExtractUnits(units);
}

/**
 * @param {Array<object>} weeks
 */
export function naftaliWeeksToExtractUnits(weeks) {
  const units = [];
  for (const week of weeks ?? []) {
    units.push(...naftaliWeekToExtractUnits(week));
  }
  return units;
}
