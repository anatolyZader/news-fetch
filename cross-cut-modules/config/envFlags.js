/**
 * Shared boolean env-flag parsing. Flags differ in how unset/empty is treated —
 * pass the flag's default to envFlag() explicitly; never assume one polarity.
 */

/** True only for an explicit on value ('1' | 'true' | 'on'). */
export function envFlagOn(env, name) {
  const v = env[name];
  return v === '1' || v === 'true' || v === 'on';
}

/** True only for an explicit off value ('0' | 'false' | 'off'). */
export function envFlagOff(env, name) {
  const v = env[name];
  return v === '0' || v === 'false' || v === 'off';
}

/**
 * Tri-state flag: explicit on → true, explicit off → false,
 * unset/empty/unrecognized → defaultValue.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} name
 * @param {boolean} [defaultValue]
 */
export function envFlag(env, name, defaultValue = false) {
  if (envFlagOn(env, name)) return true;
  if (envFlagOff(env, name)) return false;
  return defaultValue;
}
