/**
 * One-way migration: fold a mailing admin's personal digest destination into the
 * shared distribution list, so the list is the single source of truth for who
 * receives the digest.
 *
 * Runs lazily, per request, for the one admin making the call — which is why it
 * needs no user enumeration and no auth lookup inside the persistence layer. It
 * is idempotent: once the preferences email is blank there is nothing left to do.
 *
 * Deliberately does NOT fall back to the account email when the preferences
 * email is already empty. Such a user is skipped by the daily cron today
 * (listDigestSubscribers requires a non-empty email), so adding them to the list
 * would start sending mail that was not being sent before.
 */

/**
 * @param {object} args
 * @param {{ getByUid: Function, upsert: Function, addRecipient: Function }} args.prefsStore
 * @param {string} args.userUid
 * @returns {{ migrated: boolean, email?: string }}
 */
export function migrateSelfAddressToList({ prefsStore, userUid }) {
  const uid = String(userUid ?? '').trim();
  if (!uid) return { migrated: false };

  const prefs = prefsStore.getByUid(uid);
  const email = String(prefs?.email ?? '').trim();
  if (!email) return { migrated: false };

  prefsStore.addRecipient({ email, addedByUid: uid });
  // Blank the personal destination so delivery has exactly one source. The row
  // itself stays: it still supplies the language and products the list inherits.
  prefsStore.upsert({ userUid: uid, email: '' });

  return { migrated: true, email: email.toLowerCase() };
}
