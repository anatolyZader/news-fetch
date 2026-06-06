/**
 * @typedef {object} IMailingPreferencesPort
 * @property {(userUid: string) => object | null} getByUid
 * @property {(userUid: string, prefs: object) => void} upsert
 * @property {(userUid: string) => void} deleteByUid
 */

export const MAILING_PREFERENCES_PORT = Symbol('IMailingPreferencesPort');
