/**
 * No-op connectivity probe adapter.
 */

/** @returns {import('./IConnectivityProbePort.js').IConnectivityProbePort} */
export function createConnectivityProbeNoOpAdapter() {
  return {
    loadProbesForDate() {
      return [];
    },
  };
}
