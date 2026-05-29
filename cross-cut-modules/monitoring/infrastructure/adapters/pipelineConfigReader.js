import { existsSync, readFileSync } from 'node:fs';

/**
 * @param {string} configPath
 * @returns {{ enabledSources: Set<string>|null, pipelineConfig: object|null }}
 */
export function loadPipelineConfig(configPath) {
  let enabledSources = null;
  let pipelineConfig = null;
  if (!existsSync(configPath)) {
    return { enabledSources, pipelineConfig };
  }
  try {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    pipelineConfig = cfg;
    enabledSources = new Set(
      Object.entries(cfg.sources ?? {})
        .filter(([, v]) => v.enabled !== false)
        .map(([k]) => k),
    );
  } catch {
    return { enabledSources: null, pipelineConfig: null };
  }
  return { enabledSources, pipelineConfig };
}
