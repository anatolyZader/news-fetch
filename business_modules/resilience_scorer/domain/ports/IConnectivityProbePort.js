/**
 * Loads external connectivity / infrastructure outage probe records for a date.
 *
 * Pipeline position: assess enrichment — probe signals are merged during
 * assessSignalsDeps and resilienceAnalysisService before evidence partitioning.
 *
 * Owns: contract surface (typedefs below) and ConnectivityProbeRecord shape.
 * Does NOT: implement adapters (those live in infrastructure/).
 *
 * Key collaborators: connectivityProbeFileAdapter, connectivityProbeNoOpAdapter,
 * assessSignalsDeps, ingestConnectivityProbesCli, loadConnectivityProbeSignals.
 */

/**
 * One manual or ingested connectivity probe for a given assessment date.
 *
 * @typedef {object} ConnectivityProbeRecord
 * @property {string} date YYYY-MM-DD probe observation date.
 * @property {string} probe_source Source identifier (e.g. netblocks-manual).
 * @property {boolean} [outage_detected] Whether an outage was observed.
 * @property {string} [affected_system] Affected system class (telecom, internet, …).
 * @property {string} [region] Optional cluster or subregion id tied to the probe.
 * @property {string} [evidence] Human-readable description of the observation.
 * @property {string} [scope] Report scope partition (national, north, …).
 */

/**
 * Port for loading connectivity probe records that become assess-time signals.
 *
 * @typedef {object} IConnectivityProbePort
 * @property {(date: string, scope?: string) => ConnectivityProbeRecord[]} loadProbesForDate
 * Return all probe records for the given date, optionally filtered to a report scope.
 * Empty array when no probes exist or the adapter is a no-op.
 */

export {};
