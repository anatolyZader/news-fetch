import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @param {{ rootDir: string }} opts
 */
export function createNewsPipelineConfigAdapter(opts) {
  const { rootDir } = opts;
  if (!rootDir) throw new Error('rootDir is required');

  return {
    isNewsPipelineEnabled() {
      try {
        const raw = readFileSync(resolve(rootDir, 'pipeline-config.json'), 'utf8');
        const cfg = JSON.parse(raw);
        return cfg?.sources?.news?.enabled !== false;
      } catch {
        return true;
      }
    },
  };
}
