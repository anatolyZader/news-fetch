#!/usr/bin/env node
/**
 * Assert client i18n key parity: every translations.en key exists in he and ru.
 * Usage: node scripts/check-i18n-parity.mjs [--fix]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const translationsPath = resolve(repoRoot, 'client/src/i18n/translations.js');
const fixMode = process.argv.includes('--fix');

const { translations } = await import(translationsPath);

const enKeys = Object.keys(translations.en ?? {});
const heKeys = new Set(Object.keys(translations.he ?? {}));
const ruKeys = new Set(Object.keys(translations.ru ?? {}));

const heMissing = enKeys.filter((k) => !heKeys.has(k));
const ruMissing = enKeys.filter((k) => !ruKeys.has(k));
const heExtra = [...heKeys].filter((k) => !Object.hasOwn(translations.en, k));
const ruExtra = [...ruKeys].filter((k) => !Object.hasOwn(translations.en, k));

if (fixMode && (heMissing.length || ruMissing.length || heExtra.length || ruExtra.length)) {
  let source = readFileSync(translationsPath, 'utf8');

  for (const loc of ['he', 'ru']) {
    const missing = loc === 'he' ? heMissing : ruMissing;
    const extra = loc === 'he' ? heExtra : ruExtra;
    if (!missing.length && !extra.length) continue;

    const sectionRe = new RegExp(String.raw`(\n  ${loc}: \{)([\s\S]*?)(\n  \},)`, 'm');
    const match = sectionRe.exec(source);
    if (!match) {
      console.error(`Could not locate ${loc} section in translations.js`);
      process.exit(1);
    }

    const existingBody = match[2];
    let body = existingBody;
    for (const key of extra) {
      const keyRe = new RegExp(String.raw`\n    '${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':[^\n]*,?\n`);
      body = body.replace(keyRe, '\n');
    }
    for (const key of missing) {
      const value = JSON.stringify(translations.en[key]);
      body += `\n    '${key.replace(/'/g, "\\'")}': ${value},`;
    }
    source = source.replace(sectionRe, `${match[1]}${body}${match[3]}`);
  }

  writeFileSync(translationsPath, source, 'utf8');
  console.log(`Fixed translations.js (${heMissing.length} he, ${ruMissing.length} ru keys backfilled from en).`);
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
