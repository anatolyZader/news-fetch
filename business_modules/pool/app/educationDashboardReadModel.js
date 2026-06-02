import { getEducationDashboard } from './educationSessionsService.js';

/**
 * Stable read-model DTO for education sessions dashboard.
 * @param {object} [opts]
 */
export async function buildEducationDashboardDto(opts = {}) {
  const raw = await getEducationDashboard(opts);
  return {
    sessions: raw?.sessions ?? [],
    summary: raw?.summary ?? null,
    fetchedAt: raw?.fetchedAt ?? new Date().toISOString(),
  };
}
