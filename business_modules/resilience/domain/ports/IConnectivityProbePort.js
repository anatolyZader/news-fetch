/**
 * Port for external connectivity / infrastructure outage probes.
 */

/**
 * @typedef {object} ConnectivityProbeRecord
 * @property {string} date YYYY-MM-DD
 * @property {string} probe_source e.g. netblocks-manual
 * @property {boolean} [outage_detected]
 * @property {string} [affected_system] telecom|internet|...
 * @property {string} [region] optional cluster/subregion id
 * @property {string} [evidence] human-readable description
 * @property {string} [scope] national|north
 */

/**
 * @typedef {object} IConnectivityProbePort
 * @property {(date: string, scope?: string) => ConnectivityProbeRecord[]} loadProbesForDate
 */

export {};
