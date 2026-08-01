import { accessSync, constants, existsSync } from 'node:fs';
import { join } from 'node:path';

import { resolveCostLogPath } from '../infrastructure/adapters/costLogReader.js';

/**
 * @param {string} path
 */
function isReadable(path) {
  if (!existsSync(path)) return false;
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function loopLagDegradedMs() {
  const n = Number.parseInt(process.env.HEALTH_LOOP_LAG_DEGRADED_MS ?? '200', 10);
  return Number.isFinite(n) && n > 0 ? n : 200;
}

/**
 * @param {{
 *   rootDir: string,
 *   sqlitePath?: string | null,
 *   sqlitePing?: (() => boolean) | null,
 *   getLoopDelayMs?: (() => number) | null,
 * }} deps
 */
export function createHealthService(deps) {
  function getHealth() {
    const rootDir = deps.rootDir;
    const sqlitePath = deps.sqlitePath ?? join(rootDir, 'db', 'app.sqlite');
    const costLogPath = resolveCostLogPath(rootDir);
    const reportsDir = join(rootDir, 'business_modules/resilience_scorer/data/daily_reports');
    const signalsDir = join(rootDir, 'business_modules', 'open_observation_extraction', 'data', 'signals');

    const sqliteOk = deps.sqlitePing ? deps.sqlitePing() : existsSync(sqlitePath);
    const checks = {
      sqlite: { ok: sqliteOk, path: sqlitePath },
      reports_dir: { ok: isReadable(reportsDir), path: reportsDir },
      signals_dir: { ok: isReadable(signalsDir), path: signalsDir },
      cost_log: { ok: isReadable(costLogPath), path: costLogPath },
    };

    if (deps.getLoopDelayMs) {
      const lagMs = Math.round(deps.getLoopDelayMs());
      checks.event_loop = { ok: lagMs < loopLagDegradedMs(), lag_ms: lagMs };
    }

    let status = 'ok';
    if (!checks.sqlite.ok) {
      status = 'unhealthy';
    } else if (!checks.reports_dir.ok || !checks.cost_log.ok || checks.event_loop?.ok === false) {
      status = 'degraded';
    }

    return {
      status,
      uptime_s: Math.round(process.uptime()),
      checks,
    };
  }

  function getPublicHealth() {
    const full = getHealth();
    return { status: full.status };
  }

  return { getHealth, getPublicHealth };
}
