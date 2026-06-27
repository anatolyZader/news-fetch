#!/usr/bin/env node
/**
 * Fail on [UNTRANSLATED] markers; warn on he/ru strings identical to English.
 * Usage: node scripts/check-i18n-quality.mjs [--strict]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localesRoot = resolve(repoRoot, 'client/src/i18n/locales');
const strict = process.argv.includes('--strict');

const ALLOWLIST = new Set([
  'EN', 'HE', 'RU', 'OK', 'PBO', 'API', 'RSS', 'URL', 'ID',
  'Naftali', 'Golan', 'Baram', 'Hiram', 'Galma',
]);

function loadLocaleMaps() {
  const translations = { en: {}, he: {}, ru: {} };
  for (const loc of ['en', 'he', 'ru']) {
    const dir = join(localesRoot, loc);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      Object.assign(translations[loc], data);
    }
  }
  return translations;
}

function isAllowlisted(key, value) {
  if (ALLOWLIST.has(value)) return true;
  if (/^https?:\/\//.test(value)) return true;
  if (/^`.*`$/.test(value)) return true;
  if (key.includes('.aria') && value.length < 24) return true;
  return false;
}

const translations = loadLocaleMaps();
const enKeys = Object.keys(translations.en);
const untranslated = [];
const heSame = [];
const ruSame = [];

for (const key of enKeys) {
  const enVal = translations.en[key];
  if (typeof enVal !== 'string') continue;
  for (const loc of ['he', 'ru']) {
    const val = translations[loc][key];
    if (typeof val === 'string' && val.startsWith('[UNTRANSLATED]')) {
      untranslated.push(`${loc}:${key}`);
    }
  }
  if (typeof enVal !== 'string' || !enVal.trim() || isAllowlisted(key, enVal)) continue;
  if (translations.he[key] === enVal) heSame.push(key);
  if (translations.ru[key] === enVal) ruSame.push(key);
}

if (untranslated.length) {
  console.error(`i18n quality failed: ${untranslated.length} [UNTRANSLATED] marker(s)`);
  console.error(`  sample: ${untranslated.slice(0, 8).join(', ')}`);
  process.exit(1);
}

if (strict && (heSame.length || ruSame.length)) {
  console.error('i18n quality strict check failed (he/ru identical to en):');
  if (heSame.length) console.error(`  he: ${heSame.length} keys`);
  if (ruSame.length) console.error(`  ru: ${ruSame.length} keys`);
  process.exit(1);
}

if (heSame.length || ruSame.length) {
  console.warn(`i18n quality note: ${heSame.length} he and ${ruSame.length} ru keys still match en (run with --strict to fail)`);
}

console.log(`i18n quality OK (${enKeys.length} en keys, no [UNTRANSLATED] markers).`);
