/**
 * Sync Firebase custom claims from config/userAccess.json (invite-only RBAC on token).
 */

import admin from 'firebase-admin';
import { listConfiguredUsers, normalizeUserEmail } from './userAccess.js';

const CLAIMS_VERSION = Number(process.env.USER_ACCESS_CLAIMS_VERSION ?? '1') || 1;

/**
 * @param {{ email: string, level: string, districtIds?: string[], allDistricts?: boolean }} user
 * @returns {Record<string, unknown>}
 */
export function claimsForConfiguredUser(user) {
  const claims = {
    appLevel: user.level,
    accessVersion: CLAIMS_VERSION,
  };
  if (user.districtIds?.length) claims.districtIds = user.districtIds;
  if (user.allDistricts) claims.allDistricts = true;
  return claims;
}

/**
 * @param {string} email
 * @returns {Promise<{ ok: boolean, uid?: string, error?: string }>}
 */
export async function syncUserAccessClaimsForEmail(email) {
  const normalized = normalizeUserEmail(email);
  const entry = listConfiguredUsers().find((u) => u.email === normalized);
  if (!entry) {
    return { ok: false, error: 'not_listed' };
  }
  try {
    const authUser = await admin.auth().getUserByEmail(normalized);
    await admin.auth().setCustomUserClaims(authUser.uid, claimsForConfiguredUser(entry));
    return { ok: true, uid: authUser.uid };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'sync_failed' };
  }
}

/**
 * Sync claims for every user in userAccess.json (Firebase account must exist).
 * @returns {Promise<Array<{ email: string, ok: boolean, uid?: string, error?: string }>>}
 */
export async function syncAllUserAccessClaims() {
  const users = listConfiguredUsers();
  const results = [];
  for (const user of users) {
    const row = await syncUserAccessClaimsForEmail(user.email);
    results.push({
      email: user.email,
      ok: row.ok,
      ...(row.uid ? { uid: row.uid } : {}),
      ...(row.error ? { error: row.error } : {}),
    });
  }
  return results;
}
