/**
 * Reads cached assessment report JSON from the evidence store / filesystem.
 *
 * Pipeline position: post-PERSIST read path — used by reportRoutes, chatRoutes,
 * mailing digest, and composition helpers that need the latest report artifact.
 *
 * Owns: contract surface (methods/typedefs below).
 * Does NOT: implement adapters (those live in infrastructure/).
 *
 * Key collaborators: createApp, registerAnalysis, reportReadPortAdapter,
 * reportCacheService, chatRoutes, runDailyDigestCli.
 */

/**
 * Port for locating and loading persisted report payloads.
 *
 * @typedef {object} IReportReadPort
 * @property {(store: unknown, opts?: { scope?: string }) => object | null} getCachedReport
 * Return the parsed report JSON for the given evidence store and optional scope,
 * or null when no cached report is available for that partition.
 * @property {(date: string, opts?: { scope?: string, reportsDir?: string }) => string | null} resolveReportJsonPathForDate
 * Resolve the on-disk path to a report JSON file for a target date and scope
 * without loading it; used for existence checks and direct file access.
 */

export const IReportReadPort = {};
