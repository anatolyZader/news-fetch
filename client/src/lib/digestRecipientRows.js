/**
 * Rows for the digest recipients list in Settings.
 *
 * Your own address reaches you through your mailing preferences, not through the
 * shared list, so the list alone never answers "who gets this digest". These rows
 * merge both so the panel can show one roster.
 */

function normalize(email) {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * @param {object} args
 * @param {Array<{ email: string }>} [args.storedRecipients] rows from /api/mail/recipients
 * @param {string} [args.selfEmail] the signed-in user's own digest destination
 * @returns {Array<{ email: string, isSelf: boolean, removable: boolean }>}
 */
export function buildDigestRecipientRows({ storedRecipients = [], selfEmail = '' } = {}) {
  const self = normalize(selfEmail);
  const stored = (Array.isArray(storedRecipients) ? storedRecipients : [])
    .map((r) => ({ email: normalize(r?.email), raw: r }))
    .filter((r) => r.email);

  const rows = stored.map((r) => ({
    email: r.email,
    isSelf: Boolean(self) && r.email === self,
    // A real stored row stays removable even when it is yours: deleting it is
    // meaningful, and your preferences row keeps delivering either way.
    removable: true,
  }));

  if (self && !rows.some((r) => r.isSelf)) {
    // Synthetic row — there is nothing in the list to delete, so it is read-only.
    // Stopping this delivery means clearing the destination field instead.
    rows.unshift({ email: self, isSelf: true, removable: false });
  }

  return rows;
}
