/**
 * Central user access registry (user / developer / maintainer).
 * Source of truth: config/userAccess.json (+ optional env overrides).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUserDistrictEnforcementForced } from './authPolicy.js';

export const ACCESS_LEVELS = Object.freeze({
  user: 'user',
  developer: 'developer',
  maintainer: 'maintainer',
});

const DEFAULT_CONFIG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../config/userAccess.json',
);

/** @typedef {'user' | 'developer' | 'maintainer'} AccessLevel */

/** @typedef {{ userDistrictEnforcementEnabled?: boolean, mailingAdmins?: string[], users?: Array<{ email?: string, level?: string, districtIds?: string[], allDistricts?: boolean }> }} UserAccessConfig */

/** Per-path cache, invalidated when the file's mtime changes. @type {Map<string, { cfg: UserAccessConfig, mtimeMs: number | null }>} */
const configCache = new Map();
/** Config pinned by setUserAccessConfigForTests for the default path (skips file reads). @type {UserAccessConfig | null} */
let pinnedConfig = null;
/** @type {Set<string>} */
const warnedKeys = new Set();

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
  if (level === ACCESS_LEVELS.user) return ACCESS_LEVELS.user;
  if (level === ACCESS_LEVELS.developer) return ACCESS_LEVELS.developer;
  if (level === ACCESS_LEVELS.maintainer) return ACCESS_LEVELS.maintainer;
  return null;
}

/**
 * @param {string} [configPath]
 */
function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  if (pinnedConfig && configPath === DEFAULT_CONFIG_PATH) return pinnedConfig;
  if (!existsSync(configPath)) {
    configCache.delete(configPath);
    return { userDistrictEnforcementEnabled: false, mailingAdmins: [], users: [] };
  }

  let mtimeMs;
  try {
    mtimeMs = statSync(configPath).mtimeMs;
  } catch {
    mtimeMs = null;
  }
  const cached = configCache.get(configPath);
  if (cached && mtimeMs !== null && mtimeMs === cached.mtimeMs) return cached.cfg;

  let cfg;
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    cfg = {
      userDistrictEnforcementEnabled: parsed?.userDistrictEnforcementEnabled === true,
      mailingAdmins: Array.isArray(parsed?.mailingAdmins) ? parsed.mailingAdmins : [],
      users: Array.isArray(parsed?.users) ? parsed.users : [],
    };
  } catch (err) {
    const warnKey = `${configPath}:${mtimeMs}`;
    if (!warnedKeys.has(warnKey)) {
      console.warn(
        `[auth] ${configPath} is invalid JSON — treating as empty (all access denied): ${err?.message ?? err}`,
      );
      warnedKeys.add(warnKey);
    }
    cfg = { userDistrictEnforcementEnabled: false, mailingAdmins: [], users: [] };
  }
  configCache.set(configPath, { cfg, mtimeMs });
  return cfg;
}

/** Reset cached config (tests). */
export function resetUserAccessCache() {
  configCache.clear();
  pinnedConfig = null;
  warnedKeys.clear();
}

/** @param {object | null} cfg */
export function setUserAccessConfigForTests(cfg) {
  pinnedConfig = cfg;
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
export function isUserDistrictEnforcementEnabled() {
  if (isUserDistrictEnforcementForced()) {
    return Object.keys(userDistrictEntriesFromUserAccess()).length > 0;
  }
  const cfg = loadConfig();
  return cfg.userDistrictEnforcementEnabled === true
    && Object.keys(userDistrictEntriesFromUserAccess()).length > 0;
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

  const developerEnv = emailsFromEnv('RESILIENCE_ANALYST_EMAILS');
  if (developerEnv.includes(normalized)) return ACCESS_LEVELS.developer;

  for (const user of listConfiguredUsers(configPath)) {
    if (user.email === normalized) return user.level;
  }
  return null;
}

/**
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function canViewDeveloperDisplay(email) {
  const level = resolveUserAccessLevel(email);
  return level === ACCESS_LEVELS.developer || level === ACCESS_LEVELS.maintainer;
}

/**
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function canRunAnalysisDisplay(email) {
  return resolveUserAccessLevel(email) === ACCESS_LEVELS.maintainer;
}

/**
 * May edit the shared digest distribution list (mail to arbitrary addresses).
 *
 * Deliberately its own allowlist rather than a rung on the access ladder: the
 * maintainer level also opens the pay-per-use social-media fetch and analysis
 * routes, and managing a mailing list should not require any of that.
 * Sources: `mailingAdmins` in config/userAccess.json, or MAIL_DIGEST_ADMIN_EMAILS.
 *
 * @param {string | null | undefined} email
 * @param {string} [configPath]
 * @returns {boolean}
 */
export function canManageMailingRecipients(email, configPath = DEFAULT_CONFIG_PATH) {
  const normalized = normalizeUserEmail(email);
  if (!normalized) return false;
  if (emailsFromEnv('MAIL_DIGEST_ADMIN_EMAILS').includes(normalized)) return true;
  const configured = (loadConfig(configPath).mailingAdmins ?? [])
    .map((e) => normalizeUserEmail(e))
    .filter(Boolean);
  return configured.includes(normalized);
}

/**
 * Rich/extended chat tools are open to every listed user (any level).
 * Spend is controlled by the per-user daily budget, not by role.
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function canUseRichChatTools(email) {
  return resolveUserAccessLevel(email) !== null;
}

/**
 * Whether any privileged users are configured (Firebase needed for token checks).
 * @returns {boolean}
 */
export function hasPrivilegedUserAccessConfigured() {
  if (listConfiguredUsers().some((u) => u.level !== ACCESS_LEVELS.user)) return true;
  if (emailsFromEnv('RESILIENCE_ANALYST_EMAILS').length > 0) return true;
  if (emailsFromEnv('RESILIENCE_MAINTAINER_EMAILS').length > 0) return true;
  return false;
}

/**
 * User district map derived from listed users.
 * @param {string} [configPath]
 * @returns {Record<string, { districtIds?: string[], allDistricts?: boolean }>}
 */
export function userDistrictEntriesFromUserAccess(configPath = DEFAULT_CONFIG_PATH) {
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
 *   canViewDeveloper: boolean,
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
    canViewDeveloper: canViewDeveloperDisplay(normalized),
    canRunAnalysis: canRunAnalysisDisplay(normalized),
    isListed,
  };
}
