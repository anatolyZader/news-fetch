#!/usr/bin/env node
/**
 * Assert client i18n key parity: every en key exists in he and ru.
 * Usage: node scripts/check-i18n-parity.mjs [--fix]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localesRoot = resolve(repoRoot, 'client/src/i18n/locales');
const fixMode = process.argv.includes('--fix');

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

function namespaceForKey(key) {
  const ns = key.split('.')[0];
  const common = new Set(['tab', 'app', 'settings', 'district', 'comp', 'ingest', 'locale', 'common']);
  return common.has(ns) ? 'common' : ns;
}

function writeKeyToNamespace(loc, key, value) {
  const ns = namespaceForKey(key);
  const path = join(localesRoot, loc, `${ns}.json`);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  data[key] = value;
  const sorted = Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

function removeKeyFromNamespace(loc, key) {
  const ns = namespaceForKey(key);
  const path = join(localesRoot, loc, `${ns}.json`);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!Object.hasOwn(data, key)) return;
  delete data[key];
  const sorted = Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

const translations = loadLocaleMaps();
const enKeys = Object.keys(translations.en ?? {});
const heKeys = new Set(Object.keys(translations.he ?? {}));
const ruKeys = new Set(Object.keys(translations.ru ?? {}));

const heMissing = enKeys.filter((k) => !heKeys.has(k));
const ruMissing = enKeys.filter((k) => !ruKeys.has(k));
const heExtra = [...heKeys].filter((k) => !Object.hasOwn(translations.en, k));
const ruExtra = [...ruKeys].filter((k) => !Object.hasOwn(translations.en, k));

if (fixMode && (heMissing.length || ruMissing.length || heExtra.length || ruExtra.length)) {
  for (const key of heMissing) {
    writeKeyToNamespace('he', key, `[UNTRANSLATED] ${translations.en[key]}`);
  }
  for (const key of ruMissing) {
    writeKeyToNamespace('ru', key, `[UNTRANSLATED] ${translations.en[key]}`);
  }
  for (const key of heExtra) removeKeyFromNamespace('he', key);
  for (const key of ruExtra) removeKeyFromNamespace('ru', key);
  console.log(`Fixed locale JSON (${heMissing.length} he, ${ruMissing.length} ru keys marked untranslated).`);
  process.exit(0);
}

if (heMissing.length || ruMissing.length || heExtra.length || ruExtra.length) {
  console.error('i18n parity check failed:');
  if (heMissing.length) {
    console.error(`  he missing ${heMissing.length} keys (sample: ${heMissing.slice(0, 8).join(', ')})`);
  }
  if (ruMissing.length) {
    console.error(`  ru missing ${ruMissing.length} keys (sample: ${ruMissing.slice(0, 8).join(', ')})`);
  }
  if (heExtra.length) {
    console.error(`  he has ${heExtra.length} extra keys not in en (sample: ${heExtra.slice(0, 8).join(', ')})`);
  }
  if (ruExtra.length) {
    console.error(`  ru has ${ruExtra.length} extra keys not in en (sample: ${ruExtra.slice(0, 8).join(', ')})`);
  }
  console.error('Run: node scripts/check-i18n-parity.mjs --fix');
  process.exit(1);
}

console.log(`i18n parity OK (${enKeys.length} keys in en/he/ru).`);
