/**
 * @typedef {object} IStateStorePort
 * @property {(path: string) => boolean} existsSync
 * @property {(path: string, encoding?: string) => string} readFileSync
 * @property {(path: string, data: string, encoding?: string) => void} writeFileSync
 * @property {(path: string, data: string, encoding?: string) => void} appendFileSync
 * @property {(path: string, options?: { recursive?: boolean }) => void} mkdirSync
 * @property {(path: string) => string[]} readdirSync
 * @property {(path: string) => { mtimeMs: number }} statSync
 */

export {};
