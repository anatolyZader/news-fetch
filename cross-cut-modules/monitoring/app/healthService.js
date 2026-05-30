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

/**
 * @param {{ rootDir: string, sqlitePath?: string | null }} deps
 */
export function createHealthService(deps) {
  function getHealth() {
    const rootDir = deps.rootDir;
    const sqlitePath = deps.sqlitePath ?? join(rootDir, 'db', 'app.sqlite');
    const costLogPath = resolveCostLogPath(rootDir);
    const reportsDir = join(rootDir, 'reports');
    const signalsDir = join(rootDir, 'signals');

    const checks = {
      sqlite: { ok: existsSync(sqlitePath), path: sqlitePath },
      reports_dir: { ok: isReadable(reportsDir), path: reportsDir },
      signals_dir: { ok: isReadable(signalsDir), path: signalsDir },
      cost_log: { ok: isReadable(costLogPath), path: costLogPath },
    };

    let status = 'ok';
    if (!checks.sqlite.ok) {
      status = 'unhealthy';
    } else if (!checks.reports_dir.ok || !checks.cost_log.ok) {
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
