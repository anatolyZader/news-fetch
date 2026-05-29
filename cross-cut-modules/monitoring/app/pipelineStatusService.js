/**
 * Aggregates filesystem pipeline artifacts into a run status snapshot.
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { getTodayInTimezone } from '../../../utils/dateUtils.js';
import { normalizeReportScopeId, reportFilePrefix } from '../../geo/reportScopeIds.js';
import { buildPipelineStageDefinitions } from '../domain/pipelineStageCatalog.js';
import { loadPipelineConfig } from '../infrastructure/adapters/pipelineConfigReader.js';
import {
  readCostForDate,
  resolveCostLogPath,
} from '../infrastructure/adapters/costLogReader.js';
import { scanArtifactStage } from '../infrastructure/adapters/filesystemArtifactScanner.js';
import {
  readReportMeta,
  resolveReportJsonPathForDate,
} from '../infrastructure/adapters/reportPathResolver.js';

const DEFAULT_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

function isSourceEnabled(enabledSources, key) {
  if (!enabledSources) return true;
  return enabledSources.has(key);
}

function computeOverall(stages) {
  const enabled = stages.filter((s) => s.enabled);
  const assess = stages.find((s) => s.id === 'assess');
  if (!assess || assess.status !== 'ok') {
    if (enabled.some((s) => s.status === 'ok')) return 'partial';
    return 'missing';
  }
  const required = enabled.filter((s) => s.id !== 'assess' && s.kind === 'signals');
  const missingRequired = required.some((s) => s.status === 'missing');
  return missingRequired ? 'partial' : 'complete';
}

function relPath(rootDir, absPath) {
  if (!absPath) return null;
  return absPath.startsWith(`${rootDir}/`) ? absPath.slice(rootDir.length + 1) : absPath;
}

/**
 * @param {{ rootDir?: string, timezone?: string }} [deps]
 */
export function createPipelineStatusService(deps = {}) {
  const defaultTimezone = deps.timezone ?? process.env.TZ_ARTICLES ?? 'Asia/Jerusalem';

  function getStatus({ date, scope = 'national', rootDir: rootOverride } = {}) {
    const rootDir = rootOverride ?? deps.rootDir ?? DEFAULT_ROOT;
    const scopeId = normalizeReportScopeId(scope);
    const targetDate = date ?? getTodayInTimezone(defaultTimezone);
    const todayInTz = getTodayInTimezone(defaultTimezone);

    const configPath = join(rootDir, 'pipeline-config.json');
    const { enabledSources } = loadPipelineConfig(configPath);
    const catalog = buildPipelineStageDefinitions(targetDate);

    const stages = [];

    for (const def of catalog.exportStages) {
      stages.push(scanArtifactStage(
        rootDir,
        def.id,
        def.label,
        def.relativePath,
        { enabled: isSourceEnabled(enabledSources, def.key), kind: def.kind },
      ));
    }

    for (const def of catalog.signalStages) {
      stages.push(scanArtifactStage(
        rootDir,
        def.id,
        def.label,
        def.relativePath,
        { enabled: isSourceEnabled(enabledSources, def.key), kind: def.kind },
      ));
    }

    const reportPath = resolveReportJsonPathForDate(rootDir, targetDate, scopeId);
    if (reportPath) {
      stages.push({
        ...scanArtifactStage(rootDir, 'assess', 'Assessment report', relPath(rootDir, reportPath), {
          enabled: true,
          kind: 'assess',
        }),
      });
    } else {
      stages.push({
        id: 'assess',
        label: 'Assessment report',
        enabled: true,
        status: 'missing',
        kind: 'assess',
        path: `reports/${reportFilePrefix(scopeId)}-${targetDate}.json`,
      });
    }

    const costLogPath = resolveCostLogPath(rootDir);
    const cost = readCostForDate(costLogPath, targetDate);
    const extractCost = cost.by_script['extract-signals'];
    const assessCost = cost.by_script['assess-signals'];

    stages.push({
      id: 'cost_extract',
      label: 'Extract signals (cost)',
      enabled: true,
      status: extractCost != null && extractCost > 0 ? 'ok' : 'missing',
      kind: 'cost',
      meta: extractCost != null ? { totalCostUsd: extractCost } : undefined,
    });
    stages.push({
      id: 'cost_assess',
      label: 'Assess signals (cost)',
      enabled: true,
      status: assessCost != null && assessCost > 0 ? 'ok' : 'missing',
      kind: 'cost',
      meta: assessCost != null ? { totalCostUsd: assessCost } : undefined,
    });

    const reportMeta = reportPath ? readReportMeta(reportPath) : null;

    return {
      date: targetDate,
      scope: scopeId,
      today_in_tz: todayInTz,
      is_stale: targetDate !== todayInTz,
      overall: computeOverall(stages),
      stages,
      cost: { total_usd: cost.total_usd, by_script: cost.by_script },
      report_served: {
        found: reportPath != null,
        report_date: targetDate,
        is_fallback: false,
        generated_at: reportMeta?.generated_at ?? null,
        path: relPath(rootDir, reportPath),
      },
    };
  }

  return { getStatus };
}
