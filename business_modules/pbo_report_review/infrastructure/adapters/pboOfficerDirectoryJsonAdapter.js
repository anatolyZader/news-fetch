/**
 * JSON officer directory: municipality name → email + language.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { IPboOfficerDirectoryPort } from '../../domain/ports/IPboOfficerDirectoryPort.js';

const ALLOWED_LANG = new Set(['en', 'he', 'ru']);

export class PboOfficerDirectoryJsonAdapter extends IPboOfficerDirectoryPort {
  constructor({ dataPath }) {
    super();
    this.dataPath = resolve(dataPath);
    this._cache = null;
  }

  _load() {
    if (this._cache) return this._cache;
    if (!existsSync(this.dataPath)) {
      this._cache = { byName: new Map(), defaultEntry: null };
      return this._cache;
    }
    const raw = JSON.parse(readFileSync(this.dataPath, 'utf8'));
    const byName = new Map();
    let defaultEntry = null;
    for (const entry of raw.officers ?? []) {
      const name = String(entry.municipality ?? '').trim();
      const email = String(entry.email ?? '').trim();
      const language = ALLOWED_LANG.has(entry.language) ? entry.language : 'he';
      if (!email) continue;
      const record = { email, language };
      if (name === 'default') {
        defaultEntry = record;
      } else if (name) {
        byName.set(name, record);
      }
    }
    this._cache = { byName, defaultEntry };
    return this._cache;
  }

  lookup(municipalityName) {
    const { byName, defaultEntry } = this._load();
    const name = String(municipalityName ?? '').trim();
    return byName.get(name) ?? defaultEntry ?? null;
  }
}

export function createPboOfficerDirectoryJsonAdapter(opts) {
  return new PboOfficerDirectoryJsonAdapter(opts);
}
