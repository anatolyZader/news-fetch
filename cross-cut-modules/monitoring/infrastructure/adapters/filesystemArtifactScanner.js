import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function extractJsonMeta(data) {
  const meta = {};
  if (typeof data.total_articles === 'number') meta.total_articles = data.total_articles;
  if (typeof data.extracted_at === 'string') meta.extracted_at = data.extracted_at;
  if (typeof data.generated_at === 'string') meta.generated_at = data.generated_at;
  if (data.assessment?.total_articles_analyzed != null) {
    meta.total_articles_analyzed = data.assessment.total_articles_analyzed;
  }
  if (Array.isArray(data.signals)) meta.total_signals = data.signals.length;
  return meta;
}

/**
 * @param {string} rootDir
 * @param {string} id
 * @param {string} label
 * @param {string} relativePath
 * @param {{ enabled?: boolean, kind?: string }} [opts]
 */
export function scanArtifactStage(rootDir, id, label, relativePath, opts = {}) {
  const { enabled = true, kind = 'artifact' } = opts;
  if (!enabled) {
    return { id, label, enabled: false, status: 'disabled', kind };
  }

  const abs = isAbsolute(relativePath) ? relativePath : join(rootDir, relativePath);
  if (!existsSync(abs)) {
    return { id, label, enabled: true, status: 'missing', kind, path: relativePath };
  }

  let mtime = null;
  try {
    mtime = new Date(statSync(abs).mtimeMs).toISOString();
  } catch {
    /* ignore */
  }

  let meta;
  if (abs.endsWith('.json')) {
    const data = readJsonSafe(abs);
    if (data) meta = extractJsonMeta(data);
  }

  return {
    id,
    label,
    enabled: true,
    status: 'ok',
    kind,
    path: relativePath,
    mtime,
    meta: meta && Object.keys(meta).length > 0 ? meta : undefined,
  };
}
