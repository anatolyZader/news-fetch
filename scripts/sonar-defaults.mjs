/**
 * Shared defaults for /fix-sonar scripts and command docs.
 * Override per run with --limit where supported.
 */

/** list-sonar-issues.mjs default when neither --all-issues nor --limit is passed */
export const SONAR_LIST_DEFAULT_LIMIT = 500;

/** fix-sonar-loop.mjs --next-batch default per fetch (loop until queue empty) */
export const FIX_SONAR_BATCH_SIZE = 500;
