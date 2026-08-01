import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ensuredDirs = new Set();

/**
 * @param {string} filePath
 */
export function ensureParentDir(filePath) {
  const dir = dirname(filePath);
  if (ensuredDirs.has(dir)) return;
  mkdirSync(dir, { recursive: true });
  ensuredDirs.add(dir);
}

/**
 * @param {string} filePath
 * @param {object} record
 */
export function appendJsonlRecord(filePath, record) {
  ensureParentDir(filePath);
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

/**
 * @param {string} filePath
 * @returns {object[]}
 */
export function readJsonlRecords(filePath) {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
