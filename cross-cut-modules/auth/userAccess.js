/**
 * Central user access registry (operator / analyst / maintainer).
 * Source of truth: config/userAccess.json (+ optional env overrides).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACCESS_LEVELS = Object.freeze({
  operator: 'operator',
  analyst: 'analyst',
  maintainer: 'maintainer',
});

const DEFAULT_CONFIG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../config/userAccess.json',
);

/** @typedef {'operator' | 'analyst' | 'maintainer'} AccessLevel */

/** @type {{ operatorDistrictEnforcementEnabled?: boolean, users?: Array<{ email?: string, level?: string, districtIds?: string[], allDistricts?: boolean }> } | null} */
let cachedConfig = null;

/**
 * @param {string} [email]
 * @returns {string}
 */
export function normalizeUserEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * @param {string} [raw]
 * @returns {AccessLevel | null}
 */
function normalizeAccessLevel(raw) {
  const level = String(raw ?? '').trim().toLowerCase();
  if (level === ACCESS_LEVELS.operator) return ACCESS_LEVELS.operator;
  if (level === ACCESS_LEVELS.analyst) return ACCESS_LEVELS.analyst;
  if (level === ACCESS_LEVELS.maintainer) return ACCESS_LEVELS.maintainer;
  return null;
}

/**
 * @param {string} [configPath]
 */
function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  if (cachedConfig && configPath === DEFAULT_CONFIG_PATH) return cachedConfig;
  if (!existsSync(configPath)) {
    const empty = { operatorDistrictEnforcementEnabled: false, users: [] };
    if (configPath === DEFAULT_CONFIG_PATH) cachedConfig = empty;
    return empty;
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    const cfg = {
      operatorDistrictEnforcementEnabled: parsed?.operatorDistrictEnforcementEnabled === true,
      users: Array.isArray(parsed?.users) ? parsed.users : [],
    };
    if (configPath === DEFAULT_CONFIG_PATH) cachedConfig = cfg;
    return cfg;
  } catch {
    const empty = { operatorDistrictEnforcementEnabled: false, users: [] };
    if (configPath === DEFAULT_CONFIG_PATH) cachedConfig = empty;
    return empty;
  }
}

/** Reset cached config (tests). */
export function resetUserAccessCache() {
  cachedConfig = null;
}

/** @param {object | null} cfg */
export function setUserAccessConfigForTests(cfg) {
  cachedConfig = cfg;
}

/**
 * @param {string} envName
 * @returns {string[]}
 */
function emailsFromEnv(envName) {
  return (process.env[envName] ?? '')
    .split(',')
    .map((e) => normalizeUserEmail(e))
    .filter(Boolean);
}

/**
 * Users declared in config/userAccess.json (not env overrides).
 * @param {string} [configPath]
 * @returns {Array<{ email: string, level: AccessLevel, districtIds?: string[], allDistricts?: boolean }>}
 */
export function listConfiguredUsers(configPath = DEFAULT_CONFIG_PATH) {
  const cfg = loadConfig(configPath);
  const out = [];
  for (const entry of cfg.users ?? []) {
    const email = normalizeUserEmail(entry?.email);
    const level = normalizeAccessLevel(entry?.level);
    if (!email || !level) continue;
    /** @type {{ email: string, level: AccessLevel, districtIds?: string[], allDistricts?: boolean }} */
    const row = { email, level };
    if (Array.isArray(entry.districtIds)) row.districtIds = [...entry.districtIds];
    if (entry.allDistricts === true) row.allDistricts = true;
    out.push(row);
  }
  return out;
}

/**
 * @returns {boolean}
 */
export function isOperatorDistrictEnforcementEnabled() {
  const cfg = loadConfig();
  return cfg.operatorDistrictEnforcementEnabled === true
    && Object.keys(operatorDistrictEntriesFromUserAccess()).length > 0;
}

/**
 * @param {string | null | undefined} email
 * @param {string} [configPath]
 * @returns {AccessLevel | null}
 */
export function resolveUserAccessLevel(email, configPath = DEFAULT_CONFIG_PATH) {
  const normalized = normalizeUserEmail(email);
  if (!normalized) return null;

  const maintainerEnv = emailsFromEnv('RESILIENCE_MAINTAINER_EMAILS');
  if (maintainerEnv.includes(normalized)) return ACCESS_LEVELS.maintainer;

  const analystEnv = emailsFromEnv('RESILIENCE_ANALYST_EMAILS');
  if (analystEnv.includes(normalized)) return ACCESS_LEVELS.analyst;

  for (const user of listConfiguredUsers(configPath)) {
    if (user.email === normalized) return user.level;
  }
  return null;
}

/**
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function canViewAnalystDisplay(email) {
  const level = resolveUserAccessLevel(email);
  return level === ACCESS_LEVELS.analyst || level === ACCESS_LEVELS.maintainer;
}

/**
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function canRunAnalysisDisplay(email) {
  return resolveUserAccessLevel(email) === ACCESS_LEVELS.maintainer;
}

/**
 * Whether any privileged users are configured (Firebase needed for token checks).
 * @returns {boolean}
 */
export function hasPrivilegedUserAccessConfigured() {
  if (listConfiguredUsers().some((u) => u.level !== ACCESS_LEVELS.operator)) return true;
  if (emailsFromEnv('RESILIENCE_ANALYST_EMAILS').length > 0) return true;
  if (emailsFromEnv('RESILIENCE_MAINTAINER_EMAILS').length > 0) return true;
  return false;
}

/**
 * Operator district map derived from listed users.
 * @param {string} [configPath]
 * @returns {Record<string, { districtIds?: string[], allDistricts?: boolean }>}
 */
export function operatorDistrictEntriesFromUserAccess(configPath = DEFAULT_CONFIG_PATH) {
  const out = {};
  for (const user of listConfiguredUsers(configPath)) {
    out[user.email] = {
      ...(user.districtIds ? { districtIds: user.districtIds } : {}),
      ...(user.allDistricts ? { allDistricts: true } : {}),
    };
  }
  return out;
}

/**
 * @param {string | null | undefined} email
 * @returns {{
 *   email: string | null,
 *   level: AccessLevel | null,
 *   canViewAnalyst: boolean,
 *   canRunAnalysis: boolean,
 *   isListed: boolean,
 * }}
 */
export function userAccessForApi(email) {
  const normalized = normalizeUserEmail(email);
  const level = resolveUserAccessLevel(normalized);
  const isListed = normalized
    ? listConfiguredUsers().some((u) => u.email === normalized)
    : false;
  return {
    email: normalized || null,
    level,
    canViewAnalyst: canViewAnalystDisplay(normalized),
    canRunAnalysis: canRunAnalysisDisplay(normalized),
    isListed,
  };
}
