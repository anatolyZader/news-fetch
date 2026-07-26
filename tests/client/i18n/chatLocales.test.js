import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '../../../client/src/i18n/locales');

function loadKeys(lang) {
  const raw = readFileSync(join(localesDir, lang, 'chat.json'), 'utf8');
  return Object.keys(JSON.parse(raw)).sort();
}

describe('chat locale completeness', () => {
  it('he and ru cover exactly the same chat keys as en', () => {
    const en = loadKeys('en');
    assert.deepEqual(loadKeys('he'), en, 'he/chat.json keys diverge from en');
    assert.deepEqual(loadKeys('ru'), en, 'ru/chat.json keys diverge from en');
  });

  it('all values are non-empty strings', () => {
    for (const lang of ['en', 'he', 'ru']) {
      const data = JSON.parse(readFileSync(join(localesDir, lang, 'chat.json'), 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        assert.equal(typeof v, 'string', `${lang}:${k}`);
        assert.ok(v.trim().length > 0, `${lang}:${k} empty`);
      }
    }
  });
});
