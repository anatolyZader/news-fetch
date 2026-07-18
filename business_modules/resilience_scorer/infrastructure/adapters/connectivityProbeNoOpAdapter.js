/**
 * No-op connectivity probe adapter.
 */

/** @returns {import('../../domain/ports/IConnectivityProbePort.js').IConnectivityProbePort} */
export function createConnectivityProbeNoOpAdapter() {
  return {
    loadProbesForDate() {
      return [];
    },
  };
}
