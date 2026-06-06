/**
 * Profile-scoped tool definitions for agent kernel consumers.
 */

/** @type {Map<string, Array<object>>} */
const profileTools = new Map();

/**
 * @param {string} profileId
 * @param {Array<object>} tools
 */
export function registerProfileTools(profileId, tools) {
  profileTools.set(profileId, tools ?? []);
}

/**
 * @param {string} profileId
 * @param {Array<object>} [extraTools]
 */
export function getToolsForProfile(profileId, extraTools = []) {
  const base = profileTools.get(profileId) ?? [];
  if (!extraTools.length) return base;
  const names = new Set(base.map((t) => t.name));
  const merged = [...base];
  for (const t of extraTools) {
    if (!names.has(t.name)) merged.push(t);
  }
  return merged;
}

export function listRegisteredProfiles() {
  return [...profileTools.keys()];
}
