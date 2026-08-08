/**
 * Builds the send list for a digest run.
 *
 * Two sources feed it: users who subscribed themselves (mailing_preferences)
 * and the shared distribution list (mailing_digest_recipients). Shared-list
 * addresses have no preferences of their own — each inherits the language and
 * products of the maintainer who added it, which is what `added_by_uid` is for.
 */
// Re-exported so the input layer, which may only reach into app/, shares the
// same address rule as the store.
export { normalizeRecipientEmail } from '../domain/services/recipientEmail.js';

export const DEFAULT_DIGEST_PRODUCTS = Object.freeze({
  report: true,
  naftali: true,
  education: true,
  platform: false,
});

export const DEFAULT_DIGEST_LANGUAGE = 'en';

function anyProductEnabled(products) {
  return Boolean(products?.report || products?.naftali || products?.education || products?.platform);
}

/**
 * @param {object} args
 * @param {Array<{ userUid?: string, email: string, language: string, products: object }>} [args.subscribers]
 * @param {Array<{ email: string, addedByUid?: string }>} [args.recipients] shared list
 * @param {(uid: string) => ({ language?: string, products?: object } | null)} [args.getPrefsByUid]
 * @returns {Array<{ email: string, language: string, products: object, source: 'subscriber'|'list' }>}
 */
export function buildDigestSendList({ subscribers = [], recipients = [], getPrefsByUid } = {}) {
  const byEmail = new Map();

  // Self-subscribers first: their own explicit preferences outrank an inherited
  // setting if the same address also sits on the shared list.
  for (const sub of subscribers) {
    const email = String(sub?.email ?? '').trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, {
      email,
      language: sub.language ?? DEFAULT_DIGEST_LANGUAGE,
      products: sub.products ?? DEFAULT_DIGEST_PRODUCTS,
      source: 'subscriber',
    });
  }

  for (const rec of recipients) {
    const email = String(rec?.email ?? '').trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    const prefs = rec.addedByUid && getPrefsByUid ? getPrefsByUid(rec.addedByUid) : null;
    byEmail.set(email, {
      email,
      language: prefs?.language ?? DEFAULT_DIGEST_LANGUAGE,
      products: prefs?.products ?? DEFAULT_DIGEST_PRODUCTS,
      source: 'list',
    });
  }

  // A digest with every product switched off would be an empty email.
  return [...byEmail.values()].filter((job) => anyProductEnabled(job.products));
}
