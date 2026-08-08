import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const localesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../client/src/i18n/locales');
const LANGS = ['en', 'he', 'ru'];

function loadLocaleMaps() {
  const translations = {};
  for (const loc of LANGS) {
    translations[loc] = {};
    const dir = join(localesRoot, loc);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      Object.assign(translations[loc], JSON.parse(readFileSync(join(dir, file), 'utf8')));
    }
  }
  return translations;
}

/**
 * SettingsPanel substitutes these tokens with a manual `.replace()`, so a
 * translation that drops one renders the literal `{token}` to the user — the
 * parity test cannot catch that, because the key is present and non-empty.
 */
const REQUIRED_TOKENS = {
  'settings.mailingDestinationHelp': '{accountEmail}',
  'settings.mailingSavedDestination': '{email}',
  'settings.mailingRecipientRemove': '{email}',
};

describe('mailing i18n placeholders', () => {
  const translations = loadLocaleMaps();

  for (const [key, token] of Object.entries(REQUIRED_TOKENS)) {
    for (const lang of LANGS) {
      it(`${key} keeps ${token} in ${lang}`, () => {
        const value = translations[lang][key];
        assert.equal(typeof value, 'string', `${lang}: ${key} missing`);
        assert.ok(value.includes(token), `${lang}: ${key} must contain ${token}, got: ${value}`);
      });
    }
  }
});

describe('mailing shared-scope copy', () => {
  const translations = loadLocaleMaps();

  // Rendered only for mailing admins, where these settings govern every
  // recipient rather than just the signed-in user.
  const SHARED_KEYS = [
    'settings.mailingLanguageHelpShared',
    'settings.mailingProductsSubShared',
    'settings.mailingRecipientSelf',
  ];

  for (const key of SHARED_KEYS) {
    for (const lang of LANGS) {
      it(`${key} is defined and non-empty in ${lang}`, () => {
        const value = translations[lang][key];
        assert.equal(typeof value, 'string', `${lang}: ${key} missing`);
        assert.ok(value.trim().length > 0, `${lang}: ${key} is empty`);
        assert.ok(!value.startsWith('settings.'), `${lang}: ${key} looks like a raw key`);
      });
    }
  }
});
