/**
 * SQLite persistence for mailing preferences (per Firebase uid).
 */
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DatabaseSync } from 'node:sqlite';

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
`;

/**
 * @param {string} dbPath Absolute path to SQLite file
 */
export function createMailingPreferencesStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
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
      const p = products && typeof products === 'object' ? products : null;
      const next = {
        email: email !== undefined ? String(email).trim() : (existing?.email ?? ''),
        language: normalizeLanguage(language !== undefined ? language : existing?.language),
        products: {
          report: p && p.report !== undefined ? Boolean(p.report) : (existing?.products.report ?? true),
          naftali: p && p.naftali !== undefined ? Boolean(p.naftali) : (existing?.products.naftali ?? true),
          education: p && p.education !== undefined ? Boolean(p.education) : (existing?.products.education ?? true),
          platform: p && p.platform !== undefined ? Boolean(p.platform) : (existing?.products.platform ?? false),
        },
      };

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
