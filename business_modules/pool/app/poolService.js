import { getEducationDashboard } from './educationSessionsService.js';
import { getNaftaliDashboard } from './naftaliService.js';

const defaultEducationPort = { getDashboard: (opts) => getEducationDashboard(opts) };
const defaultNaftaliPort = { getDashboard: (opts) => getNaftaliDashboard(opts) };

/**
 * @param {{
 *   educationSessionsPort?: { getDashboard: (opts?: { forceRefresh?: boolean }) => Promise<unknown> },
 *   naftaliDashboardPort?: { getDashboard: (opts?: { forceRefresh?: boolean }) => Promise<unknown> },
 * }} [deps]
 */
export function createPoolService({ educationSessionsPort, naftaliDashboardPort } = {}) {
  const edu = educationSessionsPort ?? defaultEducationPort;
  const naf = naftaliDashboardPort ?? defaultNaftaliPort;
  if (!edu?.getDashboard || !naf?.getDashboard) {
    throw new Error('createPoolService requires educationSessionsPort and naftaliDashboardPort with getDashboard');
  }

  return {
    /**
     * @param {{ forceRefresh?: boolean }} [opts]
     */
    getEducationDashboard(opts = {}) {
      return edu.getDashboard(opts);
    },

    /**
     * @param {{ forceRefresh?: boolean }} [opts]
     */
    getNaftaliDashboard(opts = {}) {
      return naf.getDashboard(opts);
    },
  };
}

/** Default wiring: in-module education + Naftali implementations. */
export function createDefaultPoolService() {
  return createPoolService();
}
