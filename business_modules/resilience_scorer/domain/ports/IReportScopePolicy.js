/**
 * Defines how signals and report requests are scoped to a geographic/report partition.
 *
 * Pipeline position: pre-assessment partition — applied when assess-signals loads
 * bundles and when HTTP routes resolve a scope query parameter.
 *
 * Owns: contract surface (methods/typedefs below).
 * Does NOT: implement adapters (those live in infrastructure/).
 *
 * Key collaborators: signalScopePartition, defaultReportScopePolicyAdapter,
 * regionSignalFilter, reportRoutes, operatorRecommendationService.
 */

/**
 * Policy for normalizing scope identifiers and filtering signal arrays by report scope.
 *
 * @typedef {object} IReportScopePolicy
 * @property {(signals: object[], reportScopeId: string) => object[]} filterSignalsForScope
 * Return only signals that belong to the given report scope (e.g. national vs north cluster).
 * Used after bundle load and before evidence partitioning.
 * @property {(scope: string | null | undefined) => string} normalizeReportScope
 * Coerce raw scope input (query param, CLI flag, null) to a canonical reportScopeId
 * string used consistently across cache keys, pipeline runs, and probe loading.
 */

export {};
