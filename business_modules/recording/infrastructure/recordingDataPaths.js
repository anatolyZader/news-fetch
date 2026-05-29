import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Default directory for stream captures (override with RECORDINGS_DIR). */
export function defaultRecordingsDir() {
  return resolve(moduleRoot, 'data');
}
