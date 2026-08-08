/**
 * SQLite persistence for mailing preferences (per Firebase uid).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openAppDatabase } from '../../../db/persistence/openDatabase.js';
import { normalizeRecipientEmail } from '../domain/services/recipientEmail.js';

const DDL = `
CREATE TABLE IF NOT EXISTS mailing_preferences (
  user_uid TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  product_report INTEGER NOT NULL DEFAULT 1,
  product_naftali INTEGER NOT NULL DEFAULT 1,
  product_education INTEGER NOT NULL DEFAULT 1,
  product_platform INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en', 'he', 'ru')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Shared digest distribution list. One list for the whole install, editable by
-- maintainers only (see mailingRoutes). Language/products are not stored per
-- recipient: each address inherits the preferences of the maintainer who added
-- it, so added_by_uid is the settings source, not just an audit column.
CREATE TABLE IF NOT EXISTS mailing_digest_recipients (
  email TEXT PRIMARY KEY NOT NULL,
  added_by_uid TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * @param {string} dbPath Absolute path to SQLite file
 */
export function createMailingPreferencesStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAppDatabase(dbPath);
  db.exec(DDL);
  try {
    const cols = db.prepare(`PRAGMA table_info(mailing_preferences)`).all();
    const hasLanguage = cols.some((c) => c.name === 'language');
    if (!hasLanguage) {
      db.exec("ALTER TABLE mailing_preferences ADD COLUMN language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en', 'he', 'ru'))");
    }
  } catch {
    /* ignore migration check errors */
  }

  return {
    /**
     * @returns {{ email: string, language: string, products: { report: boolean, naftali: boolean, education: boolean, platform: boolean } } | null}
     */
    getByUid(userUid) {
      const uid = String(userUid ?? '').trim();
      if (!uid) return null;
      const row = db.prepare(
        `SELECT email, language, product_report, product_naftali, product_education, product_platform
         FROM mailing_preferences WHERE user_uid = ?`,
      ).get(uid);
      if (!row) return null;
      return rowToPrefs(row);
    },

    /**
     * @param {{ userUid: string, email?: string, language?: string, products?: Partial<{ report: boolean, naftali: boolean, education: boolean, platform: boolean }> }} row
     * Omit `email` to keep existing; omit `products` or keys to keep existing flags.
     */
    upsert({ userUid, email, language, products }) {
      const uid = String(userUid ?? '').trim();
      if (!uid) throw new Error('userUid required');
      const existing = this.getByUid(uid);
      const next = mergePrefsForUpsert(existing, email, language, products);

      db.prepare(`
        INSERT INTO mailing_preferences (user_uid, email, product_report, product_naftali, product_education, product_platform, language, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_uid) DO UPDATE SET
          email = excluded.email,
          product_report = excluded.product_report,
          product_naftali = excluded.product_naftali,
          product_education = excluded.product_education,
          product_platform = excluded.product_platform,
          language = excluded.language,
          updated_at = datetime('now')
      `).run(
        uid,
        next.email,
        next.products.report ? 1 : 0,
        next.products.naftali ? 1 : 0,
        next.products.education ? 1 : 0,
        next.products.platform ? 1 : 0,
        next.language,
      );

      return this.getByUid(uid);
    },

    /**
     * Subscribers for daily digest: non-empty email and at least one product enabled.
     * @returns {Array<{ userUid: string, email: string, language: string, products: object }>}
     */
    listDigestSubscribers() {
      const rows = db.prepare(`
        SELECT user_uid, email, language, product_report, product_naftali, product_education, product_platform
        FROM mailing_preferences
        WHERE TRIM(email) != ''
          AND (product_report = 1 OR product_naftali = 1 OR product_education = 1 OR product_platform = 1)
      `).all();
      return rows.map((row) => ({
        userUid: row.user_uid,
        ...rowToPrefs(row),
      }));
    },

    /**
     * Shared digest distribution list, newest first.
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {Array<{ email: string, addedByUid: string, active: boolean, createdAt: string }>}
     */
    listRecipients(opts = {}) {
      const where = opts.includeInactive ? '' : 'WHERE active = 1';
      const rows = db.prepare(`
        SELECT email, added_by_uid, active, created_at
        FROM mailing_digest_recipients ${where}
        ORDER BY created_at DESC, email ASC
      `).all();
      return rows.map((row) => ({
        email: row.email,
        addedByUid: row.added_by_uid ?? '',
        active: Boolean(row.active),
        createdAt: row.created_at,
      }));
    },

    /**
     * Add (or re-activate) an address on the shared list.
     * @param {{ email: string, addedByUid: string }} args
     * @returns {{ email: string, addedByUid: string, active: boolean, createdAt: string }}
     */
    addRecipient({ email, addedByUid }) {
      const normalized = normalizeRecipientEmail(email);
      if (!normalized) throw new Error('valid email required');
      db.prepare(`
        INSERT INTO mailing_digest_recipients (email, added_by_uid, active, created_at)
        VALUES (?, ?, 1, datetime('now'))
        ON CONFLICT(email) DO UPDATE SET
          added_by_uid = excluded.added_by_uid,
          active = 1
      `).run(normalized, String(addedByUid ?? '').trim());
      return this.listRecipients({ includeInactive: true }).find((r) => r.email === normalized);
    },

    /**
     * @param {string} email
     * @returns {boolean} true when a row was removed
     */
    removeRecipient(email) {
      const normalized = normalizeRecipientEmail(email);
      if (!normalized) return false;
      const info = db.prepare('DELETE FROM mailing_digest_recipients WHERE email = ?').run(normalized);
      return info.changes > 0;
    },
  };
}

function resolveProductFlag(products, key, existing, defaultValue) {
  if (products?.[key] !== undefined) return Boolean(products[key]);
  return existing?.products[key] ?? defaultValue;
}

function mergePrefsForUpsert(existing, email, language, products) {
  const p = products && typeof products === 'object' ? products : null;
  return {
    email: email === undefined ? (existing?.email ?? '') : String(email).trim(),
    language: normalizeLanguage(language === undefined ? existing?.language : language),
    products: {
      report: resolveProductFlag(p, 'report', existing, true),
      naftali: resolveProductFlag(p, 'naftali', existing, true),
      education: resolveProductFlag(p, 'education', existing, true),
      platform: resolveProductFlag(p, 'platform', existing, false),
    },
  };
}

function rowToPrefs(row) {
  return {
    email: row.email ?? '',
    language: normalizeLanguage(row.language),
    products: {
      report: Boolean(row.product_report),
      naftali: Boolean(row.product_naftali),
      education: Boolean(row.product_education),
      platform: Boolean(row.product_platform),
    },
  };
}

function normalizeLanguage(lang) {
  const v = String(lang ?? 'en').trim().toLowerCase();
  return ['en', 'he', 'ru'].includes(v) ? v : 'en';
}
