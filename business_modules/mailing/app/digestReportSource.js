/**
 * The single place that decides which report the digest shows.
 *
 * Both entry points (the API server via composition/registerAnalysis.js and the
 * cron CLI) build the thunk here so they cannot drift apart.
 *
 * Config is resolved once at construction, so changing MAIL_DIGEST_* on the API
 * server needs a restart (`pm2 restart news`). The cron CLI is a fresh process
 * each run and always picks up the current environment.
 */
import { resolveDigestReportConfig } from './mailingConfig.js';

/**
 * @param {object} deps
 * @param {import('../../resilience_scorer/domain/ports/IReportReadPort.js').IReportReadPort} deps.reportReadPort
 * @param {object} [deps.evidenceStore]
 * @param {NodeJS.ProcessEnv} [deps.env]
 * @param {(msg: string) => void} [deps.log]
 * @returns {(() => object | null) & { config: ReturnType<typeof resolveDigestReportConfig> }}
 */
export function createDigestReportSource({ reportReadPort, evidenceStore, env = process.env, log = console.log }) {
  if (!reportReadPort) throw new Error('createDigestReportSource requires reportReadPort');

  const config = resolveDigestReportConfig(env);
  const { scope, scopeRaw, scopeCoerced, selection, selectionRaw, selectionCoerced } = config;

  const scopeNote = scopeCoerced ? ` (COERCED from "${scopeRaw}")` : '';
  const selectionNote = selectionCoerced ? ` (COERCED from "${selectionRaw}")` : '';
  log(`[mail-digest] report source scope=${scope}${scopeNote} selection=${selection}${selectionNote}`);

  const read = () => (selection === 'latest_generated'
    ? reportReadPort.getLatestGeneratedReport(evidenceStore, { scope })
    : reportReadPort.getCachedReport(evidenceStore, { scope }));

  read.config = config;
  return read;
}
