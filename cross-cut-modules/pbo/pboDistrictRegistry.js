import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ISRAEL_REGIONAL_DISTRICT_ORDER,
  israelDistrictLabelKey,
  normalizeIsraelDistrictId,
} from '../geo/israelDistricts.js';

const DEFAULT_CONFIG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../config/pboDistrictRegistry.json',
);

/** @type {Record<string, object> | null} */
let cachedDistricts = null;

function loadRegistry(configPath = DEFAULT_CONFIG_PATH) {
  if (cachedDistricts && configPath === DEFAULT_CONFIG_PATH) return cachedDistricts;
  if (!existsSync(configPath)) {
    cachedDistricts = {};
    return cachedDistricts;
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    const districts = parsed?.districts && typeof parsed.districts === 'object' ? parsed.districts : {};
    if (configPath === DEFAULT_CONFIG_PATH) cachedDistricts = districts;
    return districts;
  } catch {
    cachedDistricts = {};
    return cachedDistricts;
  }
}

/** Reset cached registry (tests). */
export function resetPboDistrictRegistryCache() {
  cachedDistricts = null;
}

/**
 * @param {string} [raw]
 * @returns {string}
 */
export function normalizePboDistrictId(raw) {
  const id = normalizeIsraelDistrictId(raw);
  if (id === 'national') return 'north';
  return ISRAEL_REGIONAL_DISTRICT_ORDER.includes(id) ? id : 'north';
}

/**
 * @param {string} [districtId]
 * @returns {object | null}
 */
export function getPboDistrictConfig(districtId) {
  const id = normalizePboDistrictId(districtId);
  return loadRegistry()[id] ?? null;
}

/** @returns {readonly string[]} */
export function listPboDistrictIds() {
  return ISRAEL_REGIONAL_DISTRICT_ORDER.filter((id) => loadRegistry()[id]);
}

/**
 * @param {string} rootDir repo root
 * @param {string} districtId
 * @returns {string[]}
 */
export function resolveLocalExcelPaths(rootDir, districtId) {
  const id = normalizePboDistrictId(districtId);
  const config = getPboDistrictConfig(id);
  if (!config) return [];

  const prefix = String(config.localFilenamePrefix ?? `${id}_`).toLowerCase();
  const paths = new Set();

  const scanDir = (dirPath, filterPrefix) => {
    if (!existsSync(dirPath)) return;
    for (const name of readdirSync(dirPath)) {
      if (!name.endsWith('.xlsx') || name.startsWith('.')) continue;
      if (filterPrefix && !name.toLowerCase().startsWith(filterPrefix)) continue;
      paths.add(resolve(dirPath, name));
    }
  };

  if (config.localDataDir) {
    scanDir(resolve(rootDir, config.localDataDir), prefix);
  }

  if (id === 'north' && config.legacyModuleRoot) {
    scanDir(resolve(rootDir, config.legacyModuleRoot), prefix);
  }

  return [...paths].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string} rootDir
 * @param {string} districtId
 * @returns {boolean}
 */
export function districtHasLocalPboData(rootDir, districtId) {
  return resolveLocalExcelPaths(rootDir, districtId).length > 0;
}

/**
 * @param {string} rootDir
 * @param {string} districtId
 * @returns {string}
 */
export function resolveRegionalInboxDir(rootDir, districtId) {
  const config = getPboDistrictConfig(districtId);
  if (!config?.regionalInboxDir) {
    return resolve(rootDir, 'business_modules/pbo_report_regional/data');
  }
  return resolve(rootDir, config.regionalInboxDir);
}

/**
 * @param {string} [districtId]
 * @returns {string[]}
 */
export function regionalSubregionsForDistrict(districtId) {
  const config = getPboDistrictConfig(districtId);
  const raw = config?.regionalSubregions;
  return Array.isArray(raw) ? raw.map((s) => String(s).trim().toLowerCase()).filter(Boolean) : [];
}

/**
 * @param {string} rootDir
 * @returns {Array<{ id: string, labelKey: string, local: { hasData: boolean }, regional: { configured: boolean, subregions: Array<{ id: string, labelKey: string }> } }>}
 */
export function listPboDistrictsForApi(rootDir) {
  return listPboDistrictIds().map((id) => {
    const subregionIds = regionalSubregionsForDistrict(id);
    return {
      id,
      labelKey: israelDistrictLabelKey(id),
      local: { hasData: districtHasLocalPboData(rootDir, id) },
      regional: {
        configured: subregionIds.length > 0,
        subregions: subregionIds.map((subId) => ({
          id: subId,
          labelKey: `pbo.region.${subId}`,
        })),
      },
    };
  });
}
